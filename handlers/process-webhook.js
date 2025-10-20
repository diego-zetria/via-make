/**
 * Process Webhook Lambda Handler
 * Handles Replicate API webhook callbacks with signature validation
 */

const logger = require('./lib/logger');
const { postgres, redis, dynamo } = require('./lib/database');
const ReplicateClient = require('./lib/replicate');
const s3Manager = require('./lib/s3');
const metrics = require('./lib/metrics');

/**
 * Lambda handler for Replicate webhook endpoint
 * @param {Object} event - API Gateway event
 * @returns {Object} API Gateway response
 */
exports.handler = async (event) => {
  const startTime = Date.now();
  const webhookStartTime = event.headers['webhook-timestamp']
    ? parseInt(event.headers['webhook-timestamp'], 10) * 1000
    : startTime;

  const log = logger.create({
    context: 'process-webhook',
    requestId: event.requestContext?.requestId
  });

  try {
    // Debug: log body for signature validation
    console.log('Webhook body debug:', {
      bodyType: typeof event.body,
      bodyLength: event.body?.length,
      isBase64Encoded: event.isBase64Encoded,
      bodyStart: event.body?.substring(0, 100)
    });

    // Validate webhook signature
    const replicateClient = new ReplicateClient();

    const isValid = replicateClient.validateWebhook({
      headers: event.headers,
      body: event.body
    });

    if (!isValid) {
      log.error('Invalid webhook signature', {
        webhookId: event.headers['webhook-id']
      });

      return createResponse(401, {
        error: 'Invalid webhook signature'
      });
    }

    log.info('Webhook signature validated', {
      webhookId: event.headers['webhook-id']
    });

    // Parse webhook payload
    const payload = JSON.parse(event.body);
    const { id: replicateId, status, output, error: replicateError, metrics: replicateMetrics } = payload;

    log.info('Webhook received', {
      replicateId,
      status,
      hasOutput: !!output,
      hasError: !!replicateError
    });

    // Only deduplicate terminal events (succeeded, failed, canceled)
    // Non-terminal events (start, processing) are allowed to pass through
    const isTerminal = ['succeeded', 'failed', 'canceled'].includes(status);

    if (isTerminal) {
      const dedupeKey = `webhook:processed:${replicateId}`;
      const alreadyProcessed = await redis.get(dedupeKey);

      if (alreadyProcessed) {
        log.warn('Duplicate webhook detected', { replicateId, status });

        return createResponse(200, {
          message: 'Webhook already processed',
          replicateId,
          status
        });
      }

      // Mark webhook as processing (set 24 hour TTL)
      await redis.set(dedupeKey, status, 86400);
    }

    // Find job by replicateId using DynamoDB GSI
    const dynamoTable = process.env.DYNAMODB_TABLE;
    const jobs = await dynamo.scan(
      dynamoTable,
      'replicateId = :rid',
      { ':rid': replicateId }
    );

    if (!jobs || jobs.length === 0) {
      log.error('Job not found for webhook', { replicateId });

      // Still return 200 to prevent Replicate retries
      return createResponse(200, {
        message: 'Job not found',
        replicateId
      });
    }

    const job = jobs[0];
    const { jobId, userId, mediaType, modelId } = job;

    log.info('Job found', {
      jobId,
      userId,
      mediaType,
      modelId,
      replicateId
    });

    // Handle different webhook statuses
    if (status === 'succeeded' && output) {
      await handleSuccessfulGeneration({
        jobId,
        userId,
        mediaType,
        modelId,
        replicateId,
        output,
        replicateMetrics,
        log
      });

      // Record webhook latency
      const webhookLatency = Date.now() - webhookStartTime;
      await metrics.recordWebhookLatency(webhookLatency, 'succeeded');

    } else if (status === 'failed' || status === 'canceled') {
      await handleFailedGeneration({
        jobId,
        userId,
        mediaType,
        modelId,
        replicateId,
        status,
        error: replicateError,
        log
      });

      const webhookLatency = Date.now() - webhookStartTime;
      await metrics.recordWebhookLatency(webhookLatency, status);

    } else {
      log.info('Webhook status not terminal', {
        jobId,
        status,
        replicateId
      });
    }

    log.info('Webhook processed successfully', {
      jobId,
      replicateId,
      duration: Date.now() - startTime
    });

    return createResponse(200, {
      message: 'Webhook processed',
      jobId,
      status
    });

  } catch (error) {
    log.error('Webhook processing failed', {
      error: error.message,
      stack: error.stack
    });

    // Return 200 to prevent Replicate retries for our internal errors
    return createResponse(200, {
      message: 'Webhook received but processing failed',
      error: error.message
    });
  }
};

/**
 * Handle successful media generation
 */
async function handleSuccessfulGeneration(params) {
  const { jobId, userId, mediaType, modelId, replicateId, output, replicateMetrics, log } = params;

  log.info('Processing successful generation', {
    jobId,
    replicateId,
    outputType: Array.isArray(output) ? 'array' : typeof output
  });

  // Extract output URL (can be array or single URL)
  const outputUrls = Array.isArray(output) ? output : [output];
  const primaryOutputUrl = outputUrls[0];

  if (!primaryOutputUrl) {
    throw new Error('No output URL in webhook payload');
  }

  // Download media from Replicate
  log.info('Downloading media from Replicate', {
    jobId,
    url: primaryOutputUrl.substring(0, 50) + '...'
  });

  const downloadStartTime = Date.now();
  const replicateClient = new ReplicateClient();
  const mediaBuffer = await replicateClient.downloadFile(primaryOutputUrl);
  const downloadDuration = Date.now() - downloadStartTime;

  log.info('Media downloaded', {
    jobId,
    size: mediaBuffer.length,
    duration: downloadDuration
  });

  // Determine file extension and content type
  const extension = s3Manager.extractExtension(primaryOutputUrl);
  const filename = `original.${extension}`;
  const contentType = s3Manager.getContentType(filename, mediaType);

  // Upload to S3
  log.info('Uploading to S3', { jobId, filename, contentType });

  const uploadStartTime = Date.now();
  const uploadResult = await s3Manager.uploadFromUrl({
    sourceUrl: primaryOutputUrl,
    userId,
    mediaType,
    jobId,
    filename,
    contentType,
    metadata: {
      replicateId,
      modelId,
      originalUrl: primaryOutputUrl
    }
  });
  const uploadDuration = Date.now() - uploadStartTime;

  log.info('S3 upload successful', {
    jobId,
    url: uploadResult.url,
    size: uploadResult.size,
    duration: uploadDuration
  });

  // Extract thumbnail if it's a video (for visual continuity)
  let thumbnailUrl = null;
  if (mediaType === 'video') {
    try {
      log.info('Extracting thumbnail from video', { jobId });

      // Use FFmpeg to extract last frame
      // In production, this would use FFmpeg Lambda layer or ECS task
      // For now, we'll use a placeholder approach - extract from Replicate output

      // Check if output array contains a thumbnail (some models provide it)
      if (outputUrls.length > 1) {
        // Second URL might be thumbnail
        thumbnailUrl = outputUrls[1];
        log.info('Using provided thumbnail from output array', { jobId, thumbnailUrl: thumbnailUrl.substring(0, 50) + '...' });
      } else {
        // Generate thumbnail URL by appending frame query parameter
        // This is a Replicate feature for some video URLs
        thumbnailUrl = `${primaryOutputUrl}?frame=last`;
        log.info('Using generated thumbnail URL', { jobId, thumbnailUrl: thumbnailUrl.substring(0, 50) + '...' });
      }

      // TODO: For production, implement actual thumbnail extraction:
      // 1. Download video to /tmp
      // 2. Use FFmpeg to extract last frame: ffmpeg -sseof -1 -i input.mp4 -vframes 1 thumbnail.jpg
      // 3. Upload thumbnail to S3
      // 4. Return thumbnail S3 URL

    } catch (thumbnailError) {
      log.error('Thumbnail extraction failed', {
        jobId,
        error: thumbnailError.message
      });
      // Don't fail the whole job if thumbnail extraction fails
    }
  }

  // Calculate processing time
  const jobRecord = await postgres.getJob(jobId);
  const processingTime = Date.now() - new Date(jobRecord.created_at).getTime();

  // Update PostgreSQL with results
  await postgres.updateJob(jobId, {
    status: 'completed',
    s3_url: uploadResult.url,
    s3_path: uploadResult.s3Key,
    file_size: uploadResult.size,
    processing_time: processingTime,
    completed_at: new Date(),
    metadata: {
      ...(jobRecord.metadata || {}),
      replicateOutput: output, // Store output in metadata instead
      replicateMetrics,
      downloadDuration,
      uploadDuration,
      thumbnailUrl: thumbnailUrl || null
    }
  });

  // Update DynamoDB (get existing item first to preserve timestamp)
  const dynamoTable = process.env.DYNAMODB_TABLE;
  const existingItems = await dynamo.scan(dynamoTable, 'jobId = :jid', { ':jid': jobId });

  if (existingItems && existingItems.length > 0) {
    const existingItem = existingItems[0];
    await dynamo.update(
      dynamoTable,
      { jobId, timestamp: existingItem.timestamp },
      {
        status: 'completed',
        s3Url: uploadResult.url,
        s3Path: uploadResult.s3Key,
        fileSize: uploadResult.size,
        processingTime,
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    );
  }

  // Update Redis cache (30 minute TTL)
  await redis.setJSON(
    `job:status:${jobId}`,
    {
      jobId,
      status: 'completed',
      mediaType,
      modelId,
      userId,
      result: {
        originalUrl: uploadResult.url,
        s3Path: uploadResult.s3Key,
        fileSize: uploadResult.size
      },
      processingTime,
      completedAt: new Date().toISOString()
    },
    1800 // 30 minutes
  );

  // Record metrics
  await Promise.all([
    metrics.recordJobCompleted(mediaType, modelId, processingTime),
    metrics.recordS3Upload(uploadResult.size, uploadDuration, mediaType)
  ]);

  // Notify backend Node.js application via webhook
  try {
    const backendWebhookUrl = process.env.BACKEND_WEBHOOK_URL || process.env.BACKEND_BASE_URL;

    if (backendWebhookUrl) {
      log.info('Calling backend webhook', { jobId, url: backendWebhookUrl });

      const backendPayload = {
        id: replicateId,
        status: 'succeeded',
        output: [uploadResult.url, thumbnailUrl].filter(Boolean),
        metrics: replicateMetrics
      };

      log.info('📤 Backend webhook payload:', {
        backendWebhookUrl,
        payload: JSON.stringify(backendPayload, null, 2),
        outputArray: backendPayload.output,
        firstUrl: backendPayload.output[0],
      });

      const response = await fetch(`${backendWebhookUrl}/api/webhooks/replicate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(backendPayload)
      });

      const result = await response.json();
      log.info('Backend webhook called', { jobId, status: response.status, result });
    } else {
      log.warn('BACKEND_WEBHOOK_URL not configured - skipping backend notification');
    }
  } catch (backendError) {
    log.error('Failed to notify backend', {
      jobId,
      error: backendError.message
    });
    // Don't fail the whole job if backend notification fails
  }

  log.info('Job completed successfully', {
    jobId,
    replicateId,
    processingTime,
    fileSize: uploadResult.size
  });
}

/**
 * Handle failed media generation
 */
async function handleFailedGeneration(params) {
  const { jobId, userId, mediaType, modelId, replicateId, status, error, log } = params;

  log.error('Processing failed generation', {
    jobId,
    replicateId,
    status,
    error
  });

  const errorMessage = error || `Generation ${status}`;

  // Update PostgreSQL
  await postgres.updateJob(jobId, {
    status: 'failed',
    error: errorMessage,
    completed_at: new Date()
  });

  // Update DynamoDB (get existing item first to preserve timestamp)
  const dynamoTable = process.env.DYNAMODB_TABLE;
  const existingItems = await dynamo.scan(dynamoTable, 'jobId = :jid', { ':jid': jobId });

  if (existingItems && existingItems.length > 0) {
    const existingItem = existingItems[0];
    await dynamo.update(
      dynamoTable,
      { jobId, timestamp: existingItem.timestamp },
      {
        status: 'failed',
        error: errorMessage,
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    );
  }

  // Update Redis cache
  await redis.setJSON(
    `job:status:${jobId}`,
    {
      jobId,
      status: 'failed',
      mediaType,
      modelId,
      userId,
      error: errorMessage,
      completedAt: new Date().toISOString()
    },
    1800 // 30 minutes
  );

  // Record metrics
  const errorType = status === 'canceled' ? 'user_canceled' : 'replicate_error';
  await metrics.recordJobFailed(mediaType, modelId, errorType);

  // Notify backend Node.js application via webhook
  try {
    const backendWebhookUrl = process.env.BACKEND_WEBHOOK_URL || process.env.BACKEND_BASE_URL;

    if (backendWebhookUrl) {
      log.info('Calling backend webhook for failure', { jobId, url: backendWebhookUrl });

      const backendPayload = {
        id: replicateId,
        status: status,
        error: errorMessage
      };

      const response = await fetch(`${backendWebhookUrl}/api/webhooks/replicate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(backendPayload)
      });

      const result = await response.json();
      log.info('Backend webhook called for failure', { jobId, status: response.status, result });
    }
  } catch (backendError) {
    log.error('Failed to notify backend of failure', {
      jobId,
      error: backendError.message
    });
  }

  log.info('Job marked as failed', {
    jobId,
    replicateId,
    errorType
  });
}

/**
 * Create API Gateway response
 */
function createResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  };
}
