/**
 * CloudWatch Metrics Helper
 * Provides structured metric publishing for VSL system monitoring
 */

const { CloudWatchClient, PutMetricDataCommand } = require('@aws-sdk/client-cloudwatch');
const logger = require('./logger');

class MetricsManager {
  constructor() {
    this.client = new CloudWatchClient({
      region: process.env.AWS_REGION || 'us-east-1'
    });
    this.namespace = 'VSL/MediaGeneration';
    this.stage = process.env.STAGE || 'homolog';
  }

  /**
   * Send a metric to CloudWatch
   * @param {Object} params
   * @param {string} params.metricName - Metric name
   * @param {number} params.value - Metric value
   * @param {string} params.unit - Metric unit (Count, Seconds, Milliseconds, etc.)
   * @param {Object} params.dimensions - Additional dimensions
   */
  async sendMetric({ metricName, value, unit = 'Count', dimensions = {} }) {
    const log = logger.create({ context: 'metrics', operation: 'send' });

    try {
      const metricData = {
        MetricName: metricName,
        Value: value,
        Unit: unit,
        Timestamp: new Date(),
        Dimensions: [
          { Name: 'Stage', Value: this.stage },
          ...Object.entries(dimensions).map(([Name, Value]) => ({ Name, Value }))
        ]
      };

      const command = new PutMetricDataCommand({
        Namespace: this.namespace,
        MetricData: [metricData]
      });

      await this.client.send(command);

      log.info('Metric sent', {
        metricName,
        value,
        unit,
        dimensions: { stage: this.stage, ...dimensions }
      });

    } catch (error) {
      // Don't throw on metric errors - just log
      log.error('Failed to send metric', {
        metricName,
        error: error.message
      });
    }
  }

  /**
   * Record job started
   * @param {string} mediaType - Media type (video, image, audio)
   * @param {string} modelId - Model identifier
   */
  async recordJobStarted(mediaType, modelId) {
    await this.sendMetric({
      metricName: 'JobsStarted',
      value: 1,
      unit: 'Count',
      dimensions: {
        MediaType: mediaType,
        ModelId: modelId
      }
    });
  }

  /**
   * Record job completed
   * @param {string} mediaType - Media type
   * @param {string} modelId - Model identifier
   * @param {number} processingTime - Processing time in milliseconds
   */
  async recordJobCompleted(mediaType, modelId, processingTime) {
    // Record completion count
    await this.sendMetric({
      metricName: 'JobsCompleted',
      value: 1,
      unit: 'Count',
      dimensions: {
        MediaType: mediaType,
        ModelId: modelId
      }
    });

    // Record processing time
    await this.sendMetric({
      metricName: 'ProcessingTime',
      value: processingTime,
      unit: 'Milliseconds',
      dimensions: {
        MediaType: mediaType,
        ModelId: modelId
      }
    });
  }

  /**
   * Record job failed
   * @param {string} mediaType - Media type
   * @param {string} modelId - Model identifier
   * @param {string} errorType - Error type/category
   */
  async recordJobFailed(mediaType, modelId, errorType = 'Unknown') {
    await this.sendMetric({
      metricName: 'JobsFailed',
      value: 1,
      unit: 'Count',
      dimensions: {
        MediaType: mediaType,
        ModelId: modelId,
        ErrorType: errorType
      }
    });
  }

  /**
   * Record webhook latency
   * @param {number} latencyMs - Latency in milliseconds
   * @param {string} status - Webhook status (succeeded, failed, etc.)
   */
  async recordWebhookLatency(latencyMs, status = 'succeeded') {
    await this.sendMetric({
      metricName: 'WebhookLatency',
      value: latencyMs,
      unit: 'Milliseconds',
      dimensions: {
        Status: status
      }
    });
  }

  /**
   * Record cache hit or miss
   * @param {boolean} hit - True if cache hit, false if miss
   * @param {string} cacheLayer - Cache layer (redis, dynamodb, postgres)
   */
  async recordCacheAccess(hit, cacheLayer) {
    await this.sendMetric({
      metricName: hit ? 'CacheHits' : 'CacheMisses',
      value: 1,
      unit: 'Count',
      dimensions: {
        CacheLayer: cacheLayer
      }
    });

    // Also record cache hit rate percentage
    await this.sendMetric({
      metricName: 'CacheHitRate',
      value: hit ? 100 : 0,
      unit: 'Percent',
      dimensions: {
        CacheLayer: cacheLayer
      }
    });
  }

  /**
   * Record API Gateway response time
   * @param {string} endpoint - API endpoint
   * @param {number} responseTimeMs - Response time in milliseconds
   * @param {number} statusCode - HTTP status code
   */
  async recordApiLatency(endpoint, responseTimeMs, statusCode) {
    await this.sendMetric({
      metricName: 'ApiLatency',
      value: responseTimeMs,
      unit: 'Milliseconds',
      dimensions: {
        Endpoint: endpoint,
        StatusCode: String(statusCode)
      }
    });
  }

  /**
   * Record S3 upload metrics
   * @param {number} sizeBytes - File size in bytes
   * @param {number} uploadTimeMs - Upload time in milliseconds
   * @param {string} mediaType - Media type
   */
  async recordS3Upload(sizeBytes, uploadTimeMs, mediaType) {
    // Record upload size
    await this.sendMetric({
      metricName: 'S3UploadSize',
      value: sizeBytes,
      unit: 'Bytes',
      dimensions: {
        MediaType: mediaType
      }
    });

    // Record upload time
    await this.sendMetric({
      metricName: 'S3UploadTime',
      value: uploadTimeMs,
      unit: 'Milliseconds',
      dimensions: {
        MediaType: mediaType
      }
    });
  }

  /**
   * Record database query performance
   * @param {string} operation - Database operation (insert, update, select)
   * @param {string} database - Database type (postgres, redis, dynamodb)
   * @param {number} queryTimeMs - Query time in milliseconds
   */
  async recordDatabaseQuery(operation, database, queryTimeMs) {
    await this.sendMetric({
      metricName: 'DatabaseQueryTime',
      value: queryTimeMs,
      unit: 'Milliseconds',
      dimensions: {
        Operation: operation,
        Database: database
      }
    });
  }

  /**
   * Record Replicate API call
   * @param {string} operation - API operation (create, get, cancel)
   * @param {number} responseTimeMs - Response time in milliseconds
   * @param {boolean} success - Whether the call succeeded
   */
  async recordReplicateApiCall(operation, responseTimeMs, success) {
    await this.sendMetric({
      metricName: 'ReplicateApiCalls',
      value: 1,
      unit: 'Count',
      dimensions: {
        Operation: operation,
        Success: String(success)
      }
    });

    await this.sendMetric({
      metricName: 'ReplicateApiLatency',
      value: responseTimeMs,
      unit: 'Milliseconds',
      dimensions: {
        Operation: operation
      }
    });
  }

  /**
   * Record cost estimate
   * @param {string} mediaType - Media type
   * @param {string} modelId - Model identifier
   * @param {number} costUSD - Estimated cost in USD
   */
  async recordCost(mediaType, modelId, costUSD) {
    await this.sendMetric({
      metricName: 'EstimatedCost',
      value: costUSD,
      unit: 'None', // CloudWatch doesn't have a currency unit
      dimensions: {
        MediaType: mediaType,
        ModelId: modelId
      }
    });
  }
}

// Export singleton instance
module.exports = new MetricsManager();
