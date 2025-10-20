/**
 * Generate Media Lambda Handler
 * Creates new AI media generation jobs using Replicate API
 */

const { v4: uuidv4 } = require('uuid');
const logger = require('./lib/logger');
const { postgres, redis, dynamo } = require('./lib/database');
const models = require('./lib/models');
const ReplicateClient = require('./lib/replicate');
const metrics = require('./lib/metrics');

/**
 * Lambda handler for generate-media endpoint
 * @param {Object} event - API Gateway event
 * @returns {Object} API Gateway response
 */
exports.handler = async (event) => {
  const startTime = Date.now();
  const log = logger.create({
    context: 'generate-media',
    requestId: event.requestContext?.requestId
  });

  try {
    // Parse request body
    const body = JSON.parse(event.body);
    const { userId, mediaType, modelId, parameters = {}, prompt, seed, reference_images, webhook_url } = body;

    log.info('Generation request received', {
      userId,
      mediaType,
      modelId,
      hasPrompt: !!prompt,
      hasSeed: !!seed,
      hasReferenceImages: !!reference_images
    });

    // Validate required fields
    if (!userId || !mediaType || !modelId) {
      return createResponse(400, {
        error: 'Missing required fields',
        details: 'userId, mediaType, and modelId are required'
      });
    }

    // Validate media type
    const validMediaTypes = ['video', 'image', 'audio'];
    if (!validMediaTypes.includes(mediaType)) {
      return createResponse(400, {
        error: 'Invalid media type',
        details: `mediaType must be one of: ${validMediaTypes.join(', ')}`
      });
    }

    // Check rate limit (100 requests per hour per user)
    const rateLimitKey = `ratelimit:user:${userId}:hour`;
    const requestCount = await redis.incr(rateLimitKey, 3600); // 1 hour TTL

    if (requestCount > 100) {
      log.warn('Rate limit exceeded', { userId, requestCount });
      return createResponse(429, {
        error: 'Rate limit exceeded',
        retryAfter: 3600
      });
    }

    // Validate model exists and get configuration
    let modelConfig;
    try {
      modelConfig = models.getModelConfig(modelId, mediaType);
    } catch (error) {
      log.error('Invalid model', { modelId, mediaType, error: error.message });
      return createResponse(400, {
        error: 'Invalid model',
        details: error.message
      });
    }

    // Validate and build parameters
    let replicateInput;
    try {
      // Merge prompt into parameters before validation
      const allParameters = { ...parameters };
      if (prompt) {
        allParameters.prompt = prompt;
      }

      // Add seed for visual continuity
      if (seed !== undefined && seed !== null) {
        allParameters.seed = seed;
        log.info('Using provided seed for visual continuity', { seed });
      }

      // Add reference images for visual continuity
      if (reference_images && Array.isArray(reference_images) && reference_images.length > 0) {
        allParameters.reference_images = reference_images;
        log.info('Using reference images for visual continuity', { count: reference_images.length });
      }

      replicateInput = models.buildReplicateInput(modelId, mediaType, allParameters);
    } catch (error) {
      log.error('Invalid parameters', { error: error.message });
      return createResponse(400, {
        error: 'Invalid parameters',
        details: error.message
      });
    }

    // Generate job ID
    const jobId = uuidv4();
    const timestamp = Date.now();

    log.info('Creating job', { jobId, userId, mediaType, modelId });

    // Create job in PostgreSQL
    const jobData = {
      jobId,
      userId,
      mediaType,
      modelId,
      status: 'pending',
      parameters,
      prompt: prompt || null,
      estimatedTime: models.getEstimatedTime(modelId, mediaType),
      estimatedCost: models.getModelPricing(modelId, mediaType, parameters),
      metadata: {
        createdFrom: 'api',
        userAgent: event.headers?.['User-Agent'] || 'unknown',
        seed: seed !== undefined ? seed : null,
        referenceImages: reference_images || null,
        customWebhook: !!webhook_url
      }
    };

    await postgres.createJob(jobData);
    log.info('Job created in PostgreSQL', { jobId });

    // Create tracking entry in DynamoDB (for real-time status)
    const dynamoItem = {
      jobId,
      timestamp,
      userId,
      mediaType,
      modelId,
      status: 'pending',
      createdAt: new Date().toISOString(),
      ttl: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30 days TTL
    };

    await dynamo.put(process.env.DYNAMODB_TABLE, dynamoItem);
    log.info('Job created in DynamoDB', { jobId });

    // Build webhook URL (use provided webhook_url or default)
    const webhookUrl = webhook_url || `https://${process.env.WEBHOOK_BASE_URL}/webhook/replicate`;
    log.info('Using webhook URL', { webhookUrl: webhookUrl.substring(0, 50) + '...' });

    // Create prediction in Replicate
    const replicateClient = new ReplicateClient();
    const modelVersion = models.getModelVersion(modelId, mediaType);

    log.info('Creating Replicate prediction', {
      jobId,
      modelVersion: modelVersion.substring(0, 30) + '...',
      webhookUrl
    });

    const replicateStartTime = Date.now();
    let prediction;

    try {
      prediction = await replicateClient.createPrediction({
        version: modelVersion,
        input: replicateInput,
        webhook: webhookUrl
      });

      const replicateLatency = Date.now() - replicateStartTime;
      await metrics.recordReplicateApiCall('create', replicateLatency, true);

      log.info('Replicate prediction created', {
        jobId,
        replicateId: prediction.id,
        status: prediction.status
      });

    } catch (error) {
      const replicateLatency = Date.now() - replicateStartTime;
      await metrics.recordReplicateApiCall('create', replicateLatency, false);

      log.error('Failed to create Replicate prediction', {
        jobId,
        error: error.message
      });

      // Update job status to failed
      await postgres.updateJob(jobId, {
        status: 'failed',
        error: `Replicate API error: ${error.message}`,
        completed_at: new Date()
      });

      await metrics.recordJobFailed(mediaType, modelId, 'replicate_api_error');

      return createResponse(502, {
        error: 'Failed to create prediction',
        details: error.message,
        jobId
      });
    }

    // Update databases with replicate_id
    await Promise.all([
      postgres.updateJob(jobId, {
        replicate_id: prediction.id,
        status: 'processing'
      }),
      dynamo.update(
        process.env.DYNAMODB_TABLE,
        { jobId, timestamp },
        {
          replicateId: prediction.id,
          status: 'processing',
          updatedAt: new Date().toISOString()
        }
      )
    ]);

    log.info('Job updated with Replicate ID', {
      jobId,
      replicateId: prediction.id
    });

    // Record metrics
    await Promise.all([
      metrics.recordJobStarted(mediaType, modelId),
      metrics.recordCost(mediaType, modelId, jobData.estimatedCost),
      metrics.recordApiLatency(
        '/generate-media',
        Date.now() - startTime,
        202
      )
    ]);

    // Build response
    const response = {
      jobId,
      status: 'pending',
      estimatedTime: jobData.estimatedTime,
      estimatedCost: jobData.estimatedCost,
      replicateId: prediction.id,
      message: 'Media generation started'
    };

    log.info('Generation request completed', {
      jobId,
      duration: Date.now() - startTime
    });

    return createResponse(202, response);

  } catch (error) {
    log.error('Unexpected error', {
      error: error.message,
      stack: error.stack
    });

    await metrics.recordApiLatency(
      '/generate-media',
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
 * Create API Gateway response
 * @param {number} statusCode - HTTP status code
 * @param {Object} body - Response body
 * @returns {Object} API Gateway response
 */
function createResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true
    },
    body: JSON.stringify(body)
  };
}
