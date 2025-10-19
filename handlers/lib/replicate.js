/**
 * Replicate API Client
 * Implements official patterns with retry logic, error handling, and webhook validation
 */

const crypto = require('crypto');
const https = require('https');
const logger = require('./logger');

class ReplicateClient {
  constructor(apiToken = process.env.REPLICATE_API_TOKEN) {
    if (!apiToken) {
      throw new Error('REPLICATE_API_TOKEN is required');
    }
    this.apiToken = apiToken;
    this.baseUrl = 'https://api.replicate.com/v1';
    this.webhookSecret = process.env.REPLICATE_WEBHOOK_SECRET;
  }

  /**
   * Create a prediction with retry logic and exponential backoff
   * @param {Object} options - Prediction options
   * @param {string} options.version - Model version ID
   * @param {Object} options.input - Model input parameters
   * @param {string} options.webhook - Webhook URL for completion notification
   * @param {number} maxRetries - Maximum retry attempts (default: 3)
   * @returns {Promise<Object>} Prediction response
   */
  async createPrediction(options, maxRetries = 3) {
    const { version, input, webhook } = options;

    if (!version || !input) {
      throw new Error('version and input are required');
    }

    const requestBody = {
      version,
      input,
      ...(webhook && {
        webhook,
        webhook_events_filter: ['start', 'completed']
      })
    };

    const log = logger.create({ context: 'replicate-client', operation: 'create-prediction' });

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        log.info('Creating prediction', {
          attempt,
          maxRetries,
          version: version.substring(0, 20) + '...'
        });

        const response = await this._makeRequest('POST', '/predictions', requestBody);

        if (response.id) {
          log.info('Prediction created successfully', {
            predictionId: response.id,
            status: response.status
          });
          return response;
        }

        throw new Error('Invalid response from Replicate API');

      } catch (error) {
        log.error('Prediction creation failed', {
          attempt,
          error: error.message,
          statusCode: error.statusCode
        });

        // Don't retry on client errors (4xx) except rate limiting (429)
        if (error.statusCode >= 400 && error.statusCode < 500 && error.statusCode !== 429) {
          throw error;
        }

        // Last attempt - throw error
        if (attempt === maxRetries) {
          throw new Error(`Failed to create prediction after ${maxRetries} attempts: ${error.message}`);
        }

        // Exponential backoff: 1s, 2s, 4s, capped at 10s
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        log.info('Retrying after delay', { delay, nextAttempt: attempt + 1 });
        await this._sleep(delay);
      }
    }
  }

  /**
   * Get prediction status
   * @param {string} predictionId - Prediction ID
   * @returns {Promise<Object>} Prediction status
   */
  async getPrediction(predictionId) {
    if (!predictionId) {
      throw new Error('predictionId is required');
    }

    const log = logger.create({ context: 'replicate-client', operation: 'get-prediction' });

    try {
      log.info('Fetching prediction', { predictionId });
      const response = await this._makeRequest('GET', `/predictions/${predictionId}`);

      log.info('Prediction fetched', {
        predictionId,
        status: response.status
      });

      return response;
    } catch (error) {
      log.error('Failed to fetch prediction', {
        predictionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Cancel a running prediction
   * @param {string} predictionId - Prediction ID
   * @returns {Promise<Object>} Cancellation response
   */
  async cancelPrediction(predictionId) {
    if (!predictionId) {
      throw new Error('predictionId is required');
    }

    const log = logger.create({ context: 'replicate-client', operation: 'cancel-prediction' });

    try {
      log.info('Cancelling prediction', { predictionId });
      const response = await this._makeRequest('POST', `/predictions/${predictionId}/cancel`);

      log.info('Prediction cancelled', { predictionId });
      return response;
    } catch (error) {
      log.error('Failed to cancel prediction', {
        predictionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Validate webhook signature
   * @param {Object} request - HTTP request object
   * @param {Object} request.headers - Request headers
   * @param {string} request.body - Raw request body (string)
   * @returns {boolean} True if signature is valid
   */
  validateWebhook(request) {
    if (!this.webhookSecret) {
      throw new Error('REPLICATE_WEBHOOK_SECRET is required for webhook validation');
    }

    const { headers, body } = request;
    const webhookId = headers['webhook-id'];
    const webhookTimestamp = headers['webhook-timestamp'];
    const webhookSignature = headers['webhook-signature'];

    console.log('Webhook validation debug:', {
      hasId: !!webhookId,
      hasTimestamp: !!webhookTimestamp,
      hasSignature: !!webhookSignature,
      headerKeys: Object.keys(headers),
      secretPrefix: this.webhookSecret?.substring(0, 10)
    });

    if (!webhookId || !webhookTimestamp || !webhookSignature) {
      console.log('Missing required webhook headers');
      return false;
    }

    // Check timestamp to prevent replay attacks (max 5 minutes old)
    const timestamp = parseInt(webhookTimestamp, 10);
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > 300) {
      return false;
    }

    // Construct the signed content
    const signedContent = `${webhookId}.${webhookTimestamp}.${body}`;

    // Svix/Replicate: Remove whsec_ prefix and decode from base64
    const secretBase64 = this.webhookSecret.startsWith('whsec_')
      ? this.webhookSecret.split('_')[1]
      : this.webhookSecret;

    const secret = Buffer.from(secretBase64, 'base64');

    // Calculate expected signature
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(signedContent)
      .digest('base64');

    console.log('Signature validation:', {
      receivedSignature: webhookSignature,
      expectedSignature,
      signedContentLength: signedContent.length,
      secretType: typeof secret,
      secretLength: secret.length
    });

    // Check all signatures (supports signature rotation)
    const signatures = webhookSignature.split(' ');
    for (const sig of signatures) {
      const [version, signature] = sig.split(',');
      console.log('Checking signature part:', { version, signature, expected: expectedSignature, match: signature === expectedSignature });
      if (version === 'v1' && signature === expectedSignature) {
        return true;
      }
    }

    console.log('No matching signature found');
    return false;
  }

  /**
   * Download file from URL
   * @param {string} url - File URL
   * @returns {Promise<Buffer>} File buffer
   */
  async downloadFile(url) {
    const log = logger.create({ context: 'replicate-client', operation: 'download-file' });

    return new Promise((resolve, reject) => {
      log.info('Downloading file', { url: url.substring(0, 50) + '...' });

      https.get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Download failed with status ${response.statusCode}`));
          return;
        }

        const chunks = [];
        let totalSize = 0;

        response.on('data', (chunk) => {
          chunks.push(chunk);
          totalSize += chunk.length;
        });

        response.on('end', () => {
          const buffer = Buffer.concat(chunks);
          log.info('File downloaded successfully', {
            size: totalSize,
            sizeKB: (totalSize / 1024).toFixed(2)
          });
          resolve(buffer);
        });

        response.on('error', (error) => {
          log.error('Download failed', { error: error.message });
          reject(error);
        });
      }).on('error', (error) => {
        log.error('Download request failed', { error: error.message });
        reject(error);
      });
    });
  }

  /**
   * Make HTTP request to Replicate API
   * @private
   */
  async _makeRequest(method, path, body = null) {
    const url = `${this.baseUrl}${path}`;
    const options = {
      method,
      headers: {
        'Authorization': `Token ${this.apiToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'VSL-Media-Generation/1.0'
      }
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
      const error = new Error(data.detail || `Replicate API error: ${response.status}`);
      error.statusCode = response.status;
      error.response = data;
      throw error;
    }

    return data;
  }

  /**
   * Sleep utility for retry delays
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = ReplicateClient;
