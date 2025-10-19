/**
 * Agent 5: Lambda Configuration Specialist
 *
 * Expert in AI media generation models and parameter optimization.
 * Analyzes context (VSL scripts, projects) and suggests optimal Lambda configurations.
 *
 * Specializations:
 * - Model selection (video, image, audio generators)
 * - Parameter optimization for different use cases
 * - Cost and quality trade-off analysis
 * - Technical constraint understanding (resolution, duration, formats)
 */

import { BaseAgent } from './BaseAgent.js';
import {
  AgentRole,
  AgentConfig,
  LambdaConfigInput,
  LambdaConfigOutput,
  MessagePriority,
} from './types.js';
import { logger } from '../utils/logger.js';
import { SuccessLogger } from '../utils/successLogger.js';
import * as fs from 'fs';
import * as path from 'path';

interface ModelConfig {
  video?: Record<string, any>;
  image?: Record<string, any>;
  audio?: Record<string, any>;
}

export class LambdaConfigAgent extends BaseAgent {
  private modelsConfig: ModelConfig;

  constructor() {
    const config: AgentConfig = {
      role: AgentRole.LAMBDA_CONFIG,
      model: process.env.OPENAI_MODEL || 'gpt-5',
      maxCompletionTokens: 8000, // 2000 for reasoning + 6000 for response
      reasoningEffort: 'high', // High reasoning for intelligent parameter suggestions
      systemPrompt: `You are an elite AI media generation specialist and technical consultant.

Your expertise includes:
- Deep knowledge of AI video generation models (stability-video, wan-2.5-t2v, veo-3.1, etc.)
- AI image generation (flux-schnell, sdxl, nano-banana)
- AI audio generation (musicgen)
- Parameter optimization for quality, cost, and performance
- Understanding trade-offs between resolution, duration, and cost
- Technical constraints and best practices for each model

AVAILABLE MODELS AND PARAMETERS:

VIDEO MODELS:
1. stability-video: Image-to-video (requires image input)
   - Parameters: image (required), motion_bucket_id, fps, num_frames, cond_aug
   - Best for: Animating still images, product shots
   - Cost: $0.05/generation, Time: ~60s

2. wan-2.5-t2v: Text-to-video with audio sync
   - Parameters: prompt (required), duration, size, audio (optional), negative_prompt, seed, enable_prompt_expansion
   - Resolutions: 832*480 (480p), 1280*720 (720p), 1920*1080 (1080p) - landscape/portrait
   - Best for: Marketing videos, VSL content, explanatory videos
   - Cost: $0.05-$0.15/second (resolution-based), Time: ~30s
   - Features: Audio sync, lip sync, multilingual, prompt expansion

3. wan-2.5-t2v-fast: Fast text-to-video
   - Same as wan-2.5-t2v but faster generation (~15s)
   - Best for: Quick iterations, testing

4. veo-3.1: Google's advanced text-to-video
   - Parameters: prompt (required), aspect_ratio, duration, image, reference_images (1-3 images), resolution, generate_audio, negative_prompt, seed
   - Resolutions: 720p, 1080p
   - Best for: High-quality storytelling, reference-based generation
   - Cost: $0.08-$0.12/second (resolution-based), Time: ~40s
   - Features: Reference images (character consistency), context-aware audio, high fidelity

5. veo-3.1-fast: Fast Google text-to-video
   - Same as veo-3.1 but faster (~20s) and cheaper

IMAGE MODELS:
1. flux-schnell: Fast high-quality images
   - Parameters: prompt (required), width, height, num_outputs, num_inference_steps, guidance_scale, seed
   - Best for: Quick image generation, VSL thumbnails
   - Cost: $0.003/image, Time: ~5s

2. sdxl: Stable Diffusion XL
   - Parameters: prompt (required), negative_prompt, width, height, num_outputs, num_inference_steps, guidance_scale, scheduler, seed
   - Best for: Artistic images, detailed control
   - Cost: $0.01/image, Time: ~10s

3. nano-banana: Multi-image fusion
   - Parameters: prompt (required), image_input (array of 1-10 URLs), output_format
   - Best for: Character consistency, style transfer, scene editing
   - Cost: $0.039/image, Time: ~15s
   - Features: Multi-image fusion, character consistency, SynthID watermark

AUDIO MODELS:
1. musicgen: AI music generation
   - Parameters: prompt (required), duration, temperature, top_k, top_p, model_version, output_format, seed
   - Best for: Background music, VSL soundtracks
   - Cost: $0.02/generation, Time: ~30s

CRITICAL RULES:
1. ALWAYS return ONLY valid JSON - no markdown, no code blocks, pure JSON
2. Analyze the context deeply (VSL script, project details)
3. Suggest parameters that match the use case
4. Consider cost vs quality trade-offs
5. Explain your reasoning clearly
6. Provide multiple options when applicable (e.g., 720p vs 1080p)
7. Account for technical constraints (duration limits, aspect ratios)

IMPORTANT: You MUST respond with valid JSON only. Do not wrap in markdown code blocks.

Output format for 'suggest' requests:
{
  "suggestedConfig": {
    "modelId": "wan-2.5-t2v",
    "mediaType": "video",
    "parameters": {
      "prompt": "Professional woman explaining product benefits",
      "duration": 8,
      "size": "1280*720",
      "enable_prompt_expansion": true
    }
  },
  "reasoning": "Wan-2.5-t2v selected because: 1) VSL content needs professional quality, 2) 720p balances quality and cost, 3) 8 seconds matches typical VSL section duration",
  "alternatives": [
    {
      "modelId": "veo-3.1",
      "why": "Higher quality but more expensive ($0.64 vs $0.40 for 8 seconds)",
      "costComparison": "+60% cost, +30% quality"
    }
  ],
  "estimatedCost": 0.40,
  "estimatedTime": 30,
  "recommendations": [
    "Consider adding reference images for character consistency",
    "Enable prompt_expansion for better results"
  ]
}

Output format for 'optimize' requests:
{
  "optimizedParams": {
    "prompt": "Enhanced prompt with more details...",
    "duration": 8,
    "size": "1920*1080",
    "enable_prompt_expansion": true
  },
  "changes": [
    "Upgraded to 1080p for better quality",
    "Enhanced prompt with specific details"
  ],
  "costImpact": "+$0.24 (+60%)",
  "qualityImpact": "+30% visual quality, better brand perception"
}`,
    };

    super(config);

    // Load models configuration
    this.modelsConfig = this.loadModelsConfig();
  }

  /**
   * Load models configuration from JSON file
   */
  private loadModelsConfig(): ModelConfig {
    try {
      // Try to load from project root config directory
      const configPath = path.join(process.cwd(), '..', 'config', 'models.json');
      const configData = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(configData);
    } catch (error) {
      logger.warn('Failed to load models config, using empty config', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return {};
    }
  }

  /**
   * Process Lambda configuration request
   */
  async process(input: LambdaConfigInput): Promise<LambdaConfigOutput> {
    try {
      SuccessLogger.start(`Lambda Config - ${input.requestType} for ${input.mediaType}`);

      // Build context-rich prompt
      const userPrompt = this.buildConfigPrompt(input);

      // Call GPT-5
      const response = await this.callGPT5(userPrompt, input.projectId);

      // Parse JSON response
      let configData;
      try {
        configData = JSON.parse(response);
      } catch (parseError) {
        logger.error('❌ Failed to parse GPT-5 response as JSON');

        // Fallback: Try to extract JSON from markdown code blocks
        const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);
        if (jsonMatch) {
          configData = JSON.parse(jsonMatch[1]);
        } else {
          throw new Error('GPT-5 response is not valid JSON');
        }
      }

      // Send message to Communication Bus
      await this.sendMessage(
        input.projectId,
        `Lambda config ${input.requestType} completed for ${input.mediaType}`,
        undefined, // broadcast
        input.projectId,
        MessagePriority.MEDIUM,
        {
          mediaType: input.mediaType,
          requestType: input.requestType,
          modelId: configData.suggestedConfig?.modelId || configData.optimizedParams?.modelId,
        }
      );

      SuccessLogger.success(`Lambda Config - ${input.requestType} for ${input.mediaType}`, {
        requestType: input.requestType,
        mediaType: input.mediaType,
        modelId: configData.suggestedConfig?.modelId || 'optimized',
      });

      // Format response based on request type
      if (input.requestType === 'suggest') {
        return this.createSuccessResponse(`Lambda config suggested for ${input.mediaType}`, {
          suggestedConfig: configData.suggestedConfig,
          reasoning: configData.reasoning,
          alternatives: configData.alternatives || [],
          estimatedCost: configData.estimatedCost,
          estimatedTime: configData.estimatedTime,
          recommendations: configData.recommendations || [],
        }) as LambdaConfigOutput;
      } else {
        // optimize request
        return this.createSuccessResponse(`Parameters optimized for ${input.mediaType}`, {
          optimizedParams: configData.optimizedParams,
          changes: configData.changes || [],
          costImpact: configData.costImpact,
          qualityImpact: configData.qualityImpact,
        }) as LambdaConfigOutput;
      }
    } catch (error: any) {
      SuccessLogger.error(`Lambda Config - ${input.requestType} for ${input.mediaType}`, error);

      // Request help from Fallback Handler
      await this.sendMessage(
        input.projectId,
        `Lambda config ${input.requestType} failed for ${input.mediaType}: ${error.message}`,
        AgentRole.FALLBACK_HANDLER,
        input.projectId,
        MessagePriority.HIGH,
        {
          error: error.message,
          mediaType: input.mediaType,
          requestType: input.requestType,
        }
      );

      return this.createErrorResponse(error);
    }
  }

  /**
   * Build comprehensive prompt for Lambda configuration
   */
  private buildConfigPrompt(input: LambdaConfigInput): string {
    const { requestType, mediaType, context, currentParams } = input;

    let prompt = '';

    if (requestType === 'suggest') {
      prompt = `Suggest optimal Lambda configuration for ${mediaType} generation.\n\n`;

      // Add context
      if (context) {
        prompt += `CONTEXT:\n`;
        if (context.vslScript) {
          prompt += `VSL Script Section:\n${context.vslScript}\n\n`;
        }
        if (context.projectName) {
          prompt += `Project: ${context.projectName}\n`;
        }
        if (context.targetAudience) {
          prompt += `Target Audience: ${context.targetAudience}\n`;
        }
        if (context.tone) {
          prompt += `Tone: ${context.tone}\n`;
        }
        if (context.budget) {
          prompt += `Budget: ${context.budget}\n`;
        }
        if (context.qualityPriority) {
          prompt += `Quality Priority: ${context.qualityPriority}\n`;
        }
        prompt += `\n`;
      }

      prompt += `TASK: Analyze the context and suggest the best model and parameters.\n\n`;
      prompt += `Consider:\n`;
      prompt += `- Which model is best suited for this use case?\n`;
      prompt += `- What parameters will produce the best results?\n`;
      prompt += `- What are the cost vs quality trade-offs?\n`;
      prompt += `- Are there better alternatives?\n\n`;
      prompt += `Generate your suggestion following the JSON format for 'suggest' requests in your system prompt.`;
    } else {
      // optimize request
      prompt = `Optimize these parameters for ${mediaType} generation.\n\n`;

      prompt += `CURRENT PARAMETERS:\n${JSON.stringify(currentParams, null, 2)}\n\n`;

      if (context) {
        prompt += `CONTEXT:\n`;
        if (context.vslScript) {
          prompt += `VSL Script: ${context.vslScript}\n`;
        }
        if (context.qualityPriority) {
          prompt += `Priority: ${context.qualityPriority}\n`;
        }
        prompt += `\n`;
      }

      prompt += `TASK: Suggest optimized parameters for better results.\n\n`;
      prompt += `Consider:\n`;
      prompt += `- Can we improve quality without increasing cost significantly?\n`;
      prompt += `- Are parameters aligned with the use case?\n`;
      prompt += `- What specific improvements would make the biggest impact?\n\n`;
      prompt += `Follow the JSON format for 'optimize' requests in your system prompt.`;
    }

    return prompt;
  }
}
