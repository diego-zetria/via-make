/**
 * Agent 2: System Integration Specialist
 *
 * Expert in VSL infrastructure, Lambda APIs, and Replicate models.
 * Handles cost estimation and video generation orchestration.
 *
 * Specializations:
 * - VSL Lambda API endpoints and parameters
 * - Replicate model selection and pricing
 * - Cost calculation and optimization
 * - API integration and error handling
 * - DynamoDB real-time job tracking
 * - S3 media storage management
 */

import axios from 'axios';
import { BaseAgent } from './BaseAgent.js';
import {
  AgentRole,
  AgentConfig,
  SystemIntegratorInput,
  SystemIntegratorOutput,
  MessagePriority,
} from './types.js';
import { logger } from '../utils/logger.js';

interface ReplicateModel {
  id: string;
  name: string;
  costPerSecond: number;
  maxDuration: number;
  supportedResolutions: string[];
  supportedAspectRatios: string[];
}

export class SystemIntegratorAgent extends BaseAgent {
  private lambdaBaseUrl: string;
  private replicateModels: Map<string, ReplicateModel> = new Map();

  constructor() {
    const config: AgentConfig = {
      role: AgentRole.SYSTEM_INTEGRATOR,
      model: process.env.OPENAI_MODEL || 'gpt-5',
      maxCompletionTokens: 1000, // Precise, technical responses
      reasoningEffort: 'low', // Fast, deterministic
      systemPrompt: `You are a system integration expert for the VSL Media Generation platform.

Your expertise includes:
- VSL Lambda API endpoints and their parameters
- Replicate text-to-video model selection and optimization
- Cost estimation and budget management
- API integration patterns and error handling
- Real-time job tracking with DynamoDB
- S3 media storage optimization

AVAILABLE MODELS:
1. flux-schnell (Fast, lower quality)
   - Cost: $0.003/second
   - Max duration: 10 seconds
   - Best for: Quick previews, testing

2. minimax-video-01 (Balanced)
   - Cost: $0.008/second
   - Max duration: 10 seconds
   - Best for: Standard scenes, good quality

3. luma-ray (High quality)
   - Cost: $0.02/second
   - Max duration: 8 seconds
   - Best for: Important scenes, cinematic quality

VSL LAMBDA API ENDPOINTS:
- POST /generate-media - Start video generation job
- GET /job-status/{jobId} - Check job status
- GET /media/{mediaId} - Get media URL

Your task is to:
1. Analyze the video request (prompt, duration, quality needs)
2. Select the most appropriate model based on requirements and budget
3. Calculate estimated costs
4. Return estimation data in JSON format

Output format:
{
  "modelId": "selected-model-id",
  "estimatedCost": 0.00,
  "estimatedTime": 0,
  "lambdaEndpoint": "/generate-media",
  "reasoning": "Why this model was chosen..."
}`,
    };

    super(config);

    // Initialize Lambda base URL
    this.lambdaBaseUrl =
      process.env.LAMBDA_API_BASE_URL ||
      'https://jp4xy0391j.execute-api.us-east-1.amazonaws.com/homolog';

    // Initialize Replicate models catalog
    this.initializeModels();
  }

  /**
   * Initialize Replicate models catalog
   */
  private initializeModels(): void {
    this.replicateModels.set('flux-schnell', {
      id: 'flux-schnell',
      name: 'Flux Schnell (Fast)',
      costPerSecond: 0.003,
      maxDuration: 10,
      supportedResolutions: ['512x512', '1024x1024'],
      supportedAspectRatios: ['1:1', '16:9', '9:16'],
    });

    this.replicateModels.set('minimax-video-01', {
      id: 'minimax-video-01',
      name: 'MiniMax Video (Balanced)',
      costPerSecond: 0.008,
      maxDuration: 10,
      supportedResolutions: ['720p', '1080p'],
      supportedAspectRatios: ['16:9', '9:16', '1:1'],
    });

    this.replicateModels.set('luma-ray', {
      id: 'luma-ray',
      name: 'Luma Ray (High Quality)',
      costPerSecond: 0.02,
      maxDuration: 8,
      supportedResolutions: ['1080p', '4K'],
      supportedAspectRatios: ['16:9', '21:9'],
    });

    logger.info(`✅ Loaded ${this.replicateModels.size} Replicate models`);
  }

  /**
   * Process system integration request
   */
  async process(
    input: SystemIntegratorInput
  ): Promise<SystemIntegratorOutput> {
    try {
      logger.info(
        `🔧 System Integrator processing request for novela ${input.novelaId}`
      );

      // Get model estimation from GPT-5
      const userPrompt = this.buildIntegrationPrompt(input);
      const response = await this.callGPT5(userPrompt, input.novelaId);

      // Parse JSON response
      let estimation;
      try {
        estimation = JSON.parse(response);
      } catch (parseError) {
        // Fallback: Try to extract JSON from markdown
        const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);
        if (jsonMatch) {
          estimation = JSON.parse(jsonMatch[1]);
        } else {
          throw new Error('GPT-5 response is not valid JSON');
        }
      }

      // Validate model exists
      const model = this.replicateModels.get(estimation.modelId);
      if (!model) {
        throw new Error(`Invalid model selected: ${estimation.modelId}`);
      }

      // Calculate actual cost
      const duration = input.videoRequest.duration || 8;
      const actualCost = model.costPerSecond * duration;

      // Estimate processing time (approximately 1 minute per second of video)
      const estimatedTime = duration * 60; // seconds

      logger.info(
        `✅ Model selected: ${model.name}, Cost: $${actualCost.toFixed(4)}`
      );

      // Send message to Communication Bus
      await this.sendMessage(
        input.novelaId,
        `Video estimation completed: ${model.name} - $${actualCost.toFixed(4)}`,
        undefined, // broadcast
        input.novelaId,
        MessagePriority.MEDIUM,
        {
          modelId: model.id,
          cost: actualCost,
          estimatedTime,
        }
      );

      return this.createSuccessResponse(
        'Video generation estimation completed',
        {
          estimation: {
            modelId: model.id,
            estimatedCost: actualCost,
            estimatedTime,
            lambdaEndpoint: `${this.lambdaBaseUrl}/generate-media`,
          },
        }
      ) as SystemIntegratorOutput;
    } catch (error: any) {
      logger.error(`❌ System Integrator error:`, error.message);

      // Request help from Fallback Handler
      await this.sendMessage(
        input.novelaId,
        `System integration failed: ${error.message}`,
        AgentRole.FALLBACK_HANDLER,
        input.novelaId,
        MessagePriority.HIGH,
        {
          error: error.message,
        }
      );

      return this.createErrorResponse(error);
    }
  }

  /**
   * Actually call Lambda API to start video generation
   */
  async startVideoGeneration(
    novelaId: string,
    videoRequest: {
      prompt: string;
      modelId: string;
      duration: number;
      resolution?: string;
      aspectRatio?: string;
    }
  ): Promise<SystemIntegratorOutput> {
    try {
      logger.info(`🚀 Starting video generation for novela ${novelaId}`);

      const response = await axios.post(
        `${this.lambdaBaseUrl}/generate-media`,
        {
          userId: `novela-${novelaId}`,
          mediaType: 'video',
          modelId: videoRequest.modelId,
          parameters: {
            prompt: videoRequest.prompt,
            duration: videoRequest.duration,
            resolution: videoRequest.resolution || '1080p',
            aspect_ratio: videoRequest.aspectRatio || '16:9',
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 30000, // 30 second timeout
        }
      );

      logger.info(`✅ Video generation started: Job ID ${response.data.jobId}`);

      // Send message to Communication Bus
      await this.sendMessage(
        novelaId,
        `Video generation job started: ${response.data.jobId}`,
        undefined, // broadcast
        novelaId,
        MessagePriority.HIGH,
        {
          jobId: response.data.jobId,
          status: response.data.status,
        }
      );

      return this.createSuccessResponse('Video generation job started', {
        jobId: response.data.jobId,
        status: response.data.status,
      }) as SystemIntegratorOutput;
    } catch (error: any) {
      logger.error(`❌ Lambda API call failed:`, error.message);

      // Request help from Fallback Handler
      await this.sendMessage(
        novelaId,
        `Lambda API call failed: ${error.message}`,
        AgentRole.FALLBACK_HANDLER,
        novelaId,
        MessagePriority.URGENT,
        {
          error: error.message,
          endpoint: `${this.lambdaBaseUrl}/generate-media`,
        }
      );

      return this.createErrorResponse(error);
    }
  }

  /**
   * Build prompt for model selection
   */
  private buildIntegrationPrompt(input: SystemIntegratorInput): string {
    const duration = input.videoRequest.duration || 8;

    let prompt = `Analyze this video generation request and select the best model:\n\n`;
    prompt += `PROMPT: "${input.videoRequest.prompt}"\n`;
    prompt += `DURATION: ${duration} seconds\n`;

    if (input.videoRequest.resolution) {
      prompt += `PREFERRED RESOLUTION: ${input.videoRequest.resolution}\n`;
    }

    if (input.videoRequest.aspectRatio) {
      prompt += `PREFERRED ASPECT RATIO: ${input.videoRequest.aspectRatio}\n`;
    }

    prompt += `\nConsider:\n`;
    prompt += `- Quality requirements based on the scene description\n`;
    prompt += `- Cost efficiency for the given duration\n`;
    prompt += `- Model capabilities and limitations\n\n`;
    prompt += `Return your recommendation in the JSON format specified in your system prompt.`;

    return prompt;
  }

  /**
   * Get model catalog
   */
  getModels(): ReplicateModel[] {
    return Array.from(this.replicateModels.values());
  }

  /**
   * Calculate cost for a specific model and duration
   */
  calculateCost(modelId: string, duration: number): number {
    const model = this.replicateModels.get(modelId);
    if (!model) {
      throw new Error(`Model not found: ${modelId}`);
    }

    return model.costPerSecond * duration;
  }
}
