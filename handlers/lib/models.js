/**
 * Dynamic Model Configuration Manager
 * Handles model registry parsing, validation, and parameter management
 */

const logger = require('./logger');

class ModelConfigurationManager {
  constructor() {
    this.config = null;
    this.initialized = false;
  }

  /**
   * Load and parse models configuration from environment
   * Supports both MODELS_CONFIG env var and fallback to default config file
   */
  loadConfig() {
    if (this.initialized) {
      return this.config;
    }

    const log = logger.create({ context: 'model-config', operation: 'load' });

    try {
      const configString = process.env.MODELS_CONFIG;

      if (configString) {
        // Load from environment variable
        this.config = JSON.parse(configString);
      } else {
        // Fallback to loading from file
        const fs = require('fs');
        const path = require('path');
        const configPath = path.join(__dirname, '../../config/models.json');
        const configFile = fs.readFileSync(configPath, 'utf8');
        this.config = JSON.parse(configFile);
        log.info('Loaded models from config file (fallback)');
      }

      this.initialized = true;

      const modelCount = Object.values(this.config).reduce(
        (sum, mediaType) => sum + Object.keys(mediaType).length,
        0
      );

      log.info('Models configuration loaded', {
        mediaTypes: Object.keys(this.config),
        totalModels: modelCount
      });

      return this.config;

    } catch (error) {
      log.error('Failed to load models configuration', {
        error: error.message
      });
      throw new Error(`Invalid MODELS_CONFIG: ${error.message}`);
    }
  }

  /**
   * Validate if a model exists for the given media type
   * @param {string} modelId - Model identifier
   * @param {string} mediaType - Media type (video, image, audio)
   * @returns {boolean}
   */
  validateModelId(modelId, mediaType) {
    const config = this.loadConfig();

    if (!config[mediaType]) {
      return false;
    }

    return !!config[mediaType][modelId];
  }

  /**
   * Get model configuration
   * @param {string} modelId - Model identifier
   * @param {string} mediaType - Media type (video, image, audio)
   * @returns {Object} Model configuration
   */
  getModelConfig(modelId, mediaType) {
    const config = this.loadConfig();
    const log = logger.create({ context: 'model-config', operation: 'get' });

    if (!config[mediaType]) {
      const error = new Error(`Invalid media type: ${mediaType}`);
      log.error('Invalid media type', { mediaType, availableTypes: Object.keys(config) });
      throw error;
    }

    const modelConfig = config[mediaType][modelId];

    if (!modelConfig) {
      const error = new Error(`Model not found: ${modelId} for media type ${mediaType}`);
      log.error('Model not found', {
        modelId,
        mediaType,
        availableModels: Object.keys(config[mediaType])
      });
      throw error;
    }

    log.info('Model configuration retrieved', { modelId, mediaType });
    return modelConfig;
  }

  /**
   * Validate and merge parameters with model defaults
   * @param {string} modelId - Model identifier
   * @param {string} mediaType - Media type
   * @param {Object} userParams - User-provided parameters
   * @returns {Object} Validated and merged parameters
   */
  validateParameters(modelId, mediaType, userParams = {}) {
    const modelConfig = this.getModelConfig(modelId, mediaType);
    const log = logger.create({ context: 'model-config', operation: 'validate-params' });

    // Start with model defaults
    const mergedParams = { ...modelConfig.defaults, ...userParams };

    // Validate that all provided parameters are supported (including advanced params)
    const allSupportedParams = [
      ...modelConfig.supportedParams,
      ...(modelConfig.advancedParams ? Object.keys(modelConfig.advancedParams) : [])
    ];

    const unsupportedParams = Object.keys(userParams).filter(
      param => !allSupportedParams.includes(param)
    );

    if (unsupportedParams.length > 0) {
      const error = new Error(`Unsupported parameters: ${unsupportedParams.join(', ')}`);
      log.error('Invalid parameters', {
        modelId,
        mediaType,
        unsupportedParams,
        supportedParams: allSupportedParams
      });
      throw error;
    }

    // Check for required parameters (if defined in config)
    if (modelConfig.requiredParams) {
      const missingParams = modelConfig.requiredParams.filter(
        param => !mergedParams[param]
      );

      if (missingParams.length > 0) {
        const error = new Error(`Missing required parameters: ${missingParams.join(', ')}`);
        log.error('Missing required parameters', {
          modelId,
          mediaType,
          missingParams,
          requiredParams: modelConfig.requiredParams
        });
        throw error;
      }
    }

    // Validate model-specific parameter requirements
    this.validateModelSpecificParameters(modelConfig, mergedParams, log);

    log.info('Parameters validated', {
      modelId,
      mediaType,
      paramCount: Object.keys(mergedParams).length
    });

    return mergedParams;
  }

  /**
   * Validate model-specific parameter requirements
   * Handles image arrays, audio inputs, resolutions, and advanced params
   * @param {Object} modelConfig - Model configuration
   * @param {Object} parameters - Merged parameters
   * @param {Object} log - Logger instance
   */
  validateModelSpecificParameters(modelConfig, parameters, log) {
    const capabilities = modelConfig.capabilities || {};

    // Validate image_input array (nano-banana)
    if (capabilities.supportsImageInput && parameters.image_input) {
      if (capabilities.imageInputType === 'array') {
        if (!Array.isArray(parameters.image_input)) {
          throw new Error('image_input must be an array of URLs for this model');
        }

        if (parameters.image_input.length === 0) {
          throw new Error('image_input array cannot be empty');
        }

        if (parameters.image_input.length > 10) {
          throw new Error('Maximum 10 images allowed in image_input array');
        }

        // Validate each URL
        parameters.image_input.forEach((url, idx) => {
          if (!this.isValidUrl(url)) {
            throw new Error(`Invalid URL at image_input[${idx}]: ${url}`);
          }
        });

        log.info('Image input array validated', {
          imageCount: parameters.image_input.length
        });
      }
    }

    // Validate audio input (wan-2.5-t2v)
    if (capabilities.supportsAudioInput && parameters.audio) {
      if (!this.isValidUrl(parameters.audio)) {
        throw new Error('audio parameter must be a valid URL');
      }

      // Validate audio format
      const validFormats = capabilities.audioFormats || ['wav', 'mp3'];
      const hasValidExtension = validFormats.some(
        format => parameters.audio.toLowerCase().endsWith(`.${format}`)
      );

      if (!hasValidExtension) {
        throw new Error(`audio must be one of: ${validFormats.join(', ')}`);
      }

      log.info('Audio input validated', { audioUrl: parameters.audio });
    }

    // Validate reference_images array (veo-3.1)
    if (capabilities.supportsReferenceImages && parameters.reference_images) {
      if (capabilities.referenceImagesType === 'array') {
        if (!Array.isArray(parameters.reference_images)) {
          throw new Error('reference_images must be an array of URLs');
        }

        const constraints = capabilities.referenceImagesConstraints || {};
        const minImages = constraints.minImages || 1;
        const maxImages = constraints.maxImages || 3;

        if (parameters.reference_images.length < minImages) {
          throw new Error(`reference_images array must have at least ${minImages} image(s)`);
        }

        if (parameters.reference_images.length > maxImages) {
          throw new Error(`Maximum ${maxImages} images allowed in reference_images array`);
        }

        // Validate each URL
        parameters.reference_images.forEach((url, idx) => {
          if (!this.isValidUrl(url)) {
            throw new Error(`Invalid URL at reference_images[${idx}]: ${url}`);
          }
        });

        // Validate constraints when reference_images is provided
        if (constraints.aspect_ratio && parameters.aspect_ratio !== constraints.aspect_ratio) {
          throw new Error(
            `When using reference_images, aspect_ratio must be "${constraints.aspect_ratio}"`
          );
        }

        if (constraints.duration && parameters.duration !== constraints.duration) {
          throw new Error(
            `When using reference_images, duration must be ${constraints.duration} seconds`
          );
        }

        log.info('Reference images validated', {
          imageCount: parameters.reference_images.length,
          constraints: constraints
        });
      }
    }

    // Validate resolution for resolution-based pricing
    if (modelConfig.pricing?.type === 'resolution_based' && parameters.size) {
      const validResolutions = modelConfig.pricing.resolutionPricing.map(r => r.resolution);

      if (!validResolutions.includes(parameters.size)) {
        throw new Error(
          `Invalid resolution "${parameters.size}". Valid options: ${validResolutions.join(', ')}`
        );
      }

      log.info('Resolution validated', { resolution: parameters.size });
    }

    // Validate advanced parameters
    if (modelConfig.advancedParams) {
      Object.entries(parameters).forEach(([key, value]) => {
        const paramDef = modelConfig.advancedParams[key];

        if (paramDef) {
          this.validateAdvancedParameter(key, value, paramDef, log);
        }
      });
    }
  }

  /**
   * Validate a single advanced parameter
   * @param {string} key - Parameter name
   * @param {*} value - Parameter value
   * @param {Object} paramDef - Parameter definition from config
   * @param {Object} log - Logger instance
   */
  validateAdvancedParameter(key, value, paramDef, log) {
    // Type validation
    const actualType = typeof value;
    const expectedType = paramDef.type;

    if (expectedType === 'integer' && !Number.isInteger(value)) {
      throw new Error(`Parameter "${key}" must be an integer`);
    }

    if (expectedType !== 'integer' && actualType !== expectedType) {
      throw new Error(`Parameter "${key}" must be of type ${expectedType}, got ${actualType}`);
    }

    // Enum validation
    if (paramDef.enum && !paramDef.enum.includes(value)) {
      throw new Error(
        `Parameter "${key}" must be one of: ${paramDef.enum.join(', ')}`
      );
    }

    // Range validation for integers
    if (expectedType === 'integer') {
      if (paramDef.min !== undefined && value < paramDef.min) {
        throw new Error(`Parameter "${key}" must be >= ${paramDef.min}`);
      }

      if (paramDef.max !== undefined && value > paramDef.max) {
        throw new Error(`Parameter "${key}" must be <= ${paramDef.max}`);
      }
    }

    log.info('Advanced parameter validated', { key, type: expectedType });
  }

  /**
   * Validate URL format
   * @param {string} url - URL to validate
   * @returns {boolean} True if valid URL
   */
  isValidUrl(url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Build input object for Replicate API
   * @param {string} modelId - Model identifier
   * @param {string} mediaType - Media type
   * @param {Object} userParams - User-provided parameters
   * @returns {Object} Replicate-compatible input object
   */
  buildReplicateInput(modelId, mediaType, userParams = {}) {
    const validatedParams = this.validateParameters(modelId, mediaType, userParams);
    const log = logger.create({ context: 'model-config', operation: 'build-input' });

    // Remove any null or undefined values
    const cleanedInput = Object.entries(validatedParams).reduce((acc, [key, value]) => {
      if (value !== null && value !== undefined) {
        acc[key] = value;
      }
      return acc;
    }, {});

    log.info('Replicate input built', {
      modelId,
      mediaType,
      paramCount: Object.keys(cleanedInput).length
    });

    return cleanedInput;
  }

  /**
   * Get model version ID for Replicate API
   * @param {string} modelId - Model identifier
   * @param {string} mediaType - Media type
   * @returns {string} Model version string
   */
  getModelVersion(modelId, mediaType) {
    const modelConfig = this.getModelConfig(modelId, mediaType);
    return modelConfig.version;
  }

  /**
   * Get pricing information for a model
   * @param {string} modelId - Model identifier
   * @param {string} mediaType - Media type
   * @param {Object} parameters - User parameters for dynamic pricing calculation
   * @returns {number} Price per generation in USD
   */
  getModelPricing(modelId, mediaType, parameters = {}) {
    const modelConfig = this.getModelConfig(modelId, mediaType);
    return this.calculateEstimatedCost(modelConfig, parameters);
  }

  /**
   * Calculate estimated cost based on model pricing structure
   * Supports fixed pricing and resolution-based pricing
   * @param {Object} modelConfig - Model configuration object
   * @param {Object} parameters - User parameters
   * @returns {number} Estimated cost in USD
   */
  calculateEstimatedCost(modelConfig, parameters = {}) {
    const pricing = modelConfig.pricing;

    // Handle legacy format (pricing as number)
    if (typeof pricing === 'number') {
      return pricing;
    }

    // Handle new format (pricing as object)
    if (!pricing || typeof pricing !== 'object') {
      return 0;
    }

    // Fixed pricing
    if (pricing.type === 'fixed') {
      return pricing.basePrice || 0;
    }

    // Resolution-based pricing (e.g., wan-2.5-t2v, veo-3.1)
    if (pricing.type === 'resolution_based') {
      // Support both 'size' (wan models) and 'resolution' (veo models)
      const resolution = parameters.size || parameters.resolution || modelConfig.defaults?.size || modelConfig.defaults?.resolution;
      const duration = parameters.duration || modelConfig.defaults?.duration || 1;

      if (!resolution || !pricing.resolutionPricing) {
        return pricing.basePrice || 0;
      }

      const resolutionConfig = pricing.resolutionPricing.find(
        r => r.resolution === resolution
      );

      if (!resolutionConfig) {
        return pricing.basePrice || 0;
      }

      return duration * resolutionConfig.pricePerSecond;
    }

    // Default to basePrice
    return pricing.basePrice || 0;
  }

  /**
   * Get estimated generation time
   * @param {string} modelId - Model identifier
   * @param {string} mediaType - Media type
   * @returns {number} Estimated time in seconds
   */
  getEstimatedTime(modelId, mediaType) {
    const modelConfig = this.getModelConfig(modelId, mediaType);
    return modelConfig.estimatedTime || 60;
  }

  /**
   * List all available models for a media type
   * @param {string} mediaType - Media type
   * @returns {Array<string>} Array of model IDs
   */
  listModels(mediaType) {
    const config = this.loadConfig();

    if (!config[mediaType]) {
      return [];
    }

    return Object.keys(config[mediaType]);
  }

  /**
   * List all supported media types
   * @returns {Array<string>} Array of media types
   */
  listMediaTypes() {
    const config = this.loadConfig();
    return Object.keys(config);
  }

  /**
   * Get complete information about all models
   * @returns {Object} Complete configuration object
   */
  getAllModels() {
    return this.loadConfig();
  }
}

// Export singleton instance
module.exports = new ModelConfigurationManager();
