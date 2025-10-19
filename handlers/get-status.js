/**
 * Get Status Lambda Handler
 * Retrieves job status with multi-layer caching strategy
 * Cache layers: Redis (fastest) → DynamoDB (fast) → PostgreSQL (authoritative)
 */

const logger = require('./lib/logger');
const { postgres, redis, dynamo } = require('./lib/database');
const metrics = require('./lib/metrics');

/**
 * Lambda handler for status endpoint
 * @param {Object} event - API Gateway event
 * @returns {Object} API Gateway response
 */
exports.handler = async (event) => {
  const startTime = Date.now();
  const log = logger.create({
    context: 'get-status',
    requestId: event.requestContext?.requestId
  });

  try {
    // Extract jobId from path parameters
    const jobId = event.pathParameters?.jobId;

    if (!jobId) {
      return createResponse(400, {
        error: 'Missing jobId',
        details: 'jobId is required in the URL path'
      });
    }

    log.info('Status request received', { jobId });

    // Layer 1: Check Redis cache (fastest)
    const cacheKey = `job:status:${jobId}`;
    const cachedStatus = await redis.getJSON(cacheKey);

    if (cachedStatus) {
      log.info('Cache hit - Redis', { jobId });
      await metrics.recordCacheAccess(true, 'redis');

      const response = formatResponse(cachedStatus);

      await metrics.recordApiLatency(
        '/status',
        Date.now() - startTime,
        200
      );

      return createResponse(200, response);
    }

    await metrics.recordCacheAccess(false, 'redis');
    log.info('Cache miss - Redis', { jobId });

    // Layer 2: Check DynamoDB (fast)
    const dynamoTable = process.env.DYNAMODB_TABLE;
    const dynamoItems = await dynamo.scan(
      dynamoTable,
      'jobId = :jid',
      { ':jid': jobId }
    );

    if (dynamoItems && dynamoItems.length > 0) {
      log.info('Cache hit - DynamoDB', { jobId });
      await metrics.recordCacheAccess(true, 'dynamodb');

      const item = dynamoItems[0];
      const status = buildStatusFromDynamo(item);

      // Update Redis cache
      await redis.setJSON(cacheKey, status, 1800); // 30 minutes

      const response = formatResponse(status);

      await metrics.recordApiLatency(
        '/status',
        Date.now() - startTime,
        200
      );

      return createResponse(200, response);
    }

    await metrics.recordCacheAccess(false, 'dynamodb');
    log.info('Cache miss - DynamoDB', { jobId });

    // Layer 3: Check PostgreSQL (authoritative)
    const job = await postgres.getJob(jobId);

    if (!job) {
      log.warn('Job not found', { jobId });

      await metrics.recordApiLatency(
        '/status',
        Date.now() - startTime,
        404
      );

      return createResponse(404, {
        error: 'Job not found',
        jobId
      });
    }

    log.info('Found in PostgreSQL', { jobId, status: job.status });
    await metrics.recordCacheAccess(true, 'postgres');

    const status = buildStatusFromPostgres(job);

    // Update both Redis and DynamoDB caches
    await Promise.all([
      redis.setJSON(cacheKey, status, 1800), // 30 minutes

      dynamo.put(dynamoTable, {
        jobId: job.job_id,
        timestamp: job.id,
        userId: job.user_id,
        mediaType: job.media_type,
        modelId: job.model_id,
        status: job.status,
        replicateId: job.replicate_id,
        s3Url: job.s3_url,
        s3Path: job.s3_path,
        fileSize: job.file_size,
        error: job.error,
        processingTime: job.processing_time,
        createdAt: job.created_at?.toISOString(),
        completedAt: job.completed_at?.toISOString(),
        updatedAt: new Date().toISOString(),
        ttl: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30 days
      })
    ]);

    const response = formatResponse(status);

    await metrics.recordApiLatency(
      '/status',
      Date.now() - startTime,
      200
    );

    return createResponse(200, response);

  } catch (error) {
    log.error('Status request failed', {
      error: error.message,
      stack: error.stack
    });

    await metrics.recordApiLatency(
      '/status',
      Date.now() - startTime,
      500
    );

    return createResponse(500, {
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Build status object from DynamoDB item
 */
function buildStatusFromDynamo(item) {
  const status = {
    jobId: item.jobId,
    status: item.status,
    mediaType: item.mediaType,
    modelId: item.modelId,
    userId: item.userId,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };

  if (item.completedAt) {
    status.completedAt = item.completedAt;
  }

  if (item.processingTime) {
    status.processingTime = item.processingTime;
  }

  if (item.status === 'completed' && item.s3Url) {
    status.result = {
      originalUrl: item.s3Url,
      s3Path: item.s3Path,
      fileSize: item.fileSize
    };
  }

  if (item.status === 'failed' && item.error) {
    status.error = item.error;
  }

  return status;
}

/**
 * Build status object from PostgreSQL row
 */
function buildStatusFromPostgres(job) {
  const status = {
    jobId: job.job_id,
    status: job.status,
    mediaType: job.media_type,
    modelId: job.model_id,
    userId: job.user_id,
    createdAt: job.created_at?.toISOString(),
    updatedAt: job.updated_at?.toISOString()
  };

  if (job.completed_at) {
    status.completedAt = job.completed_at.toISOString();
  }

  if (job.processing_time) {
    status.processingTime = job.processing_time;
  }

  if (job.status === 'completed' && job.s3_url) {
    status.result = {
      originalUrl: job.s3_url,
      s3Path: job.s3_path,
      fileSize: job.file_size
    };

    // Add metadata if available
    if (job.metadata) {
      const metadata = typeof job.metadata === 'string'
        ? JSON.parse(job.metadata)
        : job.metadata;

      if (metadata.duration) status.result.duration = metadata.duration;
      if (metadata.width) status.result.width = metadata.width;
      if (metadata.height) status.result.height = metadata.height;
      if (metadata.fps) status.result.fps = metadata.fps;
    }
  }

  if (job.status === 'failed' && job.error) {
    status.error = job.error;
  }

  return status;
}

/**
 * Format final response
 */
function formatResponse(status) {
  return {
    ...status,
    _source: 'vsl-media-generation',
    _timestamp: new Date().toISOString()
  };
}

/**
 * Create API Gateway response
 */
function createResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true,
      'Cache-Control': statusCode === 200 ? 'public, max-age=30' : 'no-cache'
    },
    body: JSON.stringify(body)
  };
}
