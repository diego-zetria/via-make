/**
 * Agent 1: Script Writer Specialist
 *
 * Expert in creating soap opera and mini-series scripts.
 * Generates visual prompts optimized for AI video generation.
 *
 * Specializations:
 * - Dramatic storytelling for novelas/soap operas
 * - Character development and dialogue
 * - Visual scene descriptions
 * - Prompt engineering for AI video models
 * - Brazilian/Latin American cultural context
 */

import { BaseAgent } from './BaseAgent.js';
import {
  AgentRole,
  AgentConfig,
  ScriptWriterInput,
  ScriptWriterOutput,
  MessagePriority,
} from './types.js';
import { logger } from '../utils/logger.js';
import { SuccessLogger } from '../utils/successLogger.js';

export class ScriptWriterAgent extends BaseAgent {
  constructor() {
    const config: AgentConfig = {
      role: AgentRole.SCRIPT_WRITER,
      model: process.env.OPENAI_MODEL || 'gpt-5',
      maxCompletionTokens: 2000, // Generous for creative writing
      reasoningEffort: 'medium', // Creative but controlled
      systemPrompt: `You are an expert script writer specializing in Brazilian soap operas (novelas) and mini-series.

Your expertise includes:
- Creating dramatic, engaging scenes with emotional depth
- Writing natural, authentic Brazilian Portuguese dialogue
- Developing compelling characters with clear motivations
- Understanding novela storytelling conventions (suspense, romance, conflict)
- Cultural sensitivity to Brazilian/Latin American contexts

CRITICAL: You must generate two outputs for each scene:

1. SCENE DESCRIPTION (for humans):
   - Character actions and dialogue
   - Emotional beats and dramatic moments
   - Scene setting and atmosphere
   - Estimated duration

2. VISUAL PROMPT (for AI video generation):
   - Concise, visual description optimized for text-to-video models
   - Focus on cinematography: camera angles, lighting, composition
   - Describe character appearances, clothing, expressions
   - Location details: indoor/outdoor, time of day, weather
   - Movement and action descriptions
   - No dialogue - purely visual elements
   - Maximum 500 characters for compatibility with Replicate models

Output format:
{
  "sceneDescription": "Full narrative scene with dialogue and actions...",
  "visualPrompt": "Cinematic description for video generation...",
  "audioPrompt": "Optional ambient sounds and music suggestions...",
  "characterActions": ["Character 1: action", "Character 2: action"],
  "estimatedDuration": 8
}

Remember: The visual prompt is the most critical output - it will be sent directly to the AI video generation model.`,
    };

    super(config);
  }

  /**
   * Process script writing request
   */
  async process(input: ScriptWriterInput): Promise<ScriptWriterOutput> {
    try {
      SuccessLogger.start(`Script Writer - Scene ${input.sceneNumber}`);

      // Build context-rich prompt
      const userPrompt = this.buildScriptPrompt(input);

      // Call GPT-5
      const response = await this.callGPT5(userPrompt, input.novelaId);

      // Parse JSON response
      let scriptData;
      try {
        scriptData = JSON.parse(response);
      } catch (parseError) {
        logger.error('❌ Failed to parse GPT-5 response as JSON');

        // Fallback: Try to extract JSON from markdown code blocks
        const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);
        if (jsonMatch) {
          scriptData = JSON.parse(jsonMatch[1]);
        } else {
          throw new Error('GPT-5 response is not valid JSON');
        }
      }

      // Validate required fields
      if (!scriptData.sceneDescription || !scriptData.visualPrompt) {
        throw new Error('Missing required fields in script output');
      }

      // Send message to Communication Bus for other agents
      await this.sendMessage(
        input.novelaId,
        `Script completed for scene ${input.sceneNumber}`,
        undefined, // broadcast
        input.novelaId,
        MessagePriority.MEDIUM,
        {
          sceneNumber: input.sceneNumber,
          scriptLength: scriptData.sceneDescription.length,
          visualPromptLength: scriptData.visualPrompt.length,
        }
      );

      SuccessLogger.success(`Script Writer - Scene ${input.sceneNumber} completed`, {
        sceneNumber: input.sceneNumber,
        visualPromptLength: scriptData.visualPrompt.length,
        estimatedDuration: scriptData.estimatedDuration || input.duration || 8,
      });

      return this.createSuccessResponse(
        `Scene ${input.sceneNumber} script generated successfully`,
        {
          script: {
            sceneDescription: scriptData.sceneDescription,
            visualPrompt: scriptData.visualPrompt,
            audioPrompt: scriptData.audioPrompt || '',
            characterActions: scriptData.characterActions || [],
            estimatedDuration: scriptData.estimatedDuration || input.duration || 8,
          },
        }
      ) as ScriptWriterOutput;
    } catch (error: any) {
      SuccessLogger.error(`Script Writer - Scene ${input.sceneNumber}`, error);

      // Request help from Fallback Handler
      await this.sendMessage(
        input.novelaId,
        `Script writing failed for scene ${input.sceneNumber}: ${error.message}`,
        AgentRole.FALLBACK_HANDLER,
        input.novelaId,
        MessagePriority.HIGH,
        {
          error: error.message,
          sceneNumber: input.sceneNumber,
        }
      );

      return this.createErrorResponse(error);
    }
  }

  /**
   * Build comprehensive prompt for script generation
   */
  private buildScriptPrompt(input: ScriptWriterInput): string {
    let prompt = `Create a script for Scene ${input.sceneNumber} of this novela.\n\n`;

    // Add previous context if available
    if (input.previousScenes && input.previousScenes.length > 0) {
      prompt += `PREVIOUS SCENES SUMMARY:\n`;
      input.previousScenes.forEach((scene, index) => {
        prompt += `Scene ${index + 1}: ${scene}\n`;
      });
      prompt += `\n`;
    }

    // Add character descriptions
    if (input.characterDescriptions) {
      prompt += `CHARACTERS:\n`;
      Object.entries(input.characterDescriptions).forEach(([name, description]) => {
        prompt += `- ${name}: ${description}\n`;
      });
      prompt += `\n`;
    }

    // Add plot points for this scene
    if (input.plotPoints && input.plotPoints.length > 0) {
      prompt += `PLOT POINTS FOR THIS SCENE:\n`;
      input.plotPoints.forEach((point) => {
        prompt += `- ${point}\n`;
      });
      prompt += `\n`;
    }

    // Add tone/style
    if (input.tone) {
      prompt += `TONE: ${input.tone}\n\n`;
    }

    // Add duration constraint
    const duration = input.duration || 8;
    prompt += `TARGET DURATION: ${duration} seconds\n\n`;

    prompt += `Generate the scene following the JSON format specified in your system prompt. Focus on creating a visually compelling scene that will work well for AI video generation.`;

    return prompt;
  }
}
