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
      maxCompletionTokens: 16000, // Increased: up to 10000 for reasoning + 6000 for response
      reasoningEffort: 'medium', // Medium reasoning to balance quality and token usage
      systemPrompt: `You are an AI media generation specialist. Analyze VSL content and suggest optimal model configurations.

KEY MODELS (with cost/time):
VIDEO:
- wan-2.5-t2v: Professional text-to-video, $0.05-$0.15/sec, 30s gen time
  Params: prompt, duration (1-8s), size (480p/720p/1080p), enable_prompt_expansion
- wan-2.5-fast: BUDGET OPTION - Same quality, HALF cost, 15s gen time ⚡
- veo-3.1: Premium quality, $0.08-$0.12/sec, 40s gen time
  Params: prompt, duration, resolution (720p/1080p), reference_images, generate_audio
- veo-3.1-fast: Premium budget, 20s gen time ⚡
- stability-video: Image-to-video, $0.05/gen, 60s (requires image input)

IMAGE:
- flux-schnell: CHEAPEST - Fast quality, $0.003/image, 5s ⚡
- sdxl: Artistic control, $0.01/image, 10s
- nano-banana: Multi-image fusion, $0.039/image, 15s

AUDIO:
- musicgen: Background music, $0.02/gen, 30s

SELECTION RULES BY BUDGET/PRIORITY:
1. Budget=LOW or Priority=COST → ALWAYS use "fast" models (wan-2.5-fast, veo-3.1-fast, flux-schnell)
2. Budget=MEDIUM + Priority=BALANCED → Standard models (wan-2.5-t2v, sdxl)
3. Budget=HIGH or Priority=QUALITY → Premium models (veo-3.1, veo-3.1 with reference_images)
4. COST priority → Use lowest resolution (480p) and shortest duration (6s)
5. BALANCED priority → Use 720p and 7-8s duration
6. QUALITY priority → Use 1080p and 8s duration

OUTPUT RULES:
1. Return ONLY valid JSON (no markdown blocks)
2. Match model to budget/priority FIRST, use case SECOND
3. Models with "fast" in name = budget priority
4. Always suggest alternatives showing cost/quality tradeoff

EXAMPLES BY SCENARIO:

SCENARIO 1 - Budget=LOW or Priority=COST (use FAST models):
{
  "suggestedConfig": {
    "modelId": "wan-2.5-fast",
    "mediaType": "video",
    "parameters": {
      "prompt": "Professional marketing message",
      "duration": 6,
      "size": "832*480",
      "enable_prompt_expansion": true
    }
  },
  "reasoning": "Budget optimization: wan-2.5-fast chosen for 50% cost reduction vs standard. 480p + 6s duration minimizes cost while maintaining acceptable quality for VSL.",
  "alternatives": [
    {"modelId": "wan-2.5-t2v", "why": "Better quality but +100% cost", "costComparison": "$0.30 vs $0.15"}
  ],
  "estimatedCost": 0.15,
  "estimatedTime": 15,
  "recommendations": ["Use 480p for cost savings", "6s duration reduces cost by 25%"]
}

SCENARIO 2 - Budget=MEDIUM + Priority=BALANCED:
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
  "reasoning": "Balanced choice: 720p offers professional quality at reasonable cost. 8s duration ideal for VSL sections.",
  "alternatives": [
    {"modelId": "wan-2.5-fast", "why": "Save 50% cost, slight speed boost", "costComparison": "$0.40 vs $0.20"},
    {"modelId": "veo-3.1", "why": "Premium quality +30%", "costComparison": "$0.64 (+60%)"}
  ],
  "estimatedCost": 0.40,
  "estimatedTime": 30,
  "recommendations": ["720p balances quality and cost", "Enable prompt_expansion for better results"]
}

SCENARIO 3 - Budget=HIGH or Priority=QUALITY:
{
  "suggestedConfig": {
    "modelId": "veo-3.1",
    "mediaType": "video",
    "parameters": {
      "prompt": "Detailed professional presentation",
      "duration": 8,
      "resolution": "1080p",
      "generate_audio": true
    }
  },
  "reasoning": "Premium quality: veo-3.1 with 1080p and audio generation for maximum brand impact and professional appearance.",
  "alternatives": [
    {"modelId": "veo-3.1-fast", "why": "Same quality, 50% faster generation", "costComparison": "Same cost, -50% time"}
  ],
  "estimatedCost": 0.64,
  "estimatedTime": 40,
  "recommendations": ["1080p for maximum quality", "Audio generation adds professional touch"]
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
