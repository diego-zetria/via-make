import OpenAI from 'openai';
import { logger } from '../utils/logger.js';
import {
  ScriptDetailInput,
  ScriptDetailOutput,
  SectionVideoDetail,
} from './types.js';

const HEROS_JOURNEY_PARTS = [
  { part: 1, name: 'The Ordinary World', step: 'Step 1: The Hero in Their World', objective: 'Establish the routine and problems of the hero before the adventure begins' },
  { part: 2, name: 'The Call to Adventure', step: 'Step 2: The Problem Arises', objective: 'Present the challenge or opportunity that disrupts the status quo' },
  { part: 3, name: 'Refusal of the Call', step: 'Step 3: Initial Hesitation', objective: 'Show the hero\'s doubts, fears, or reasons for not taking action' },
  { part: 4, name: 'Meeting the Mentor', step: 'Step 4: Guidance and Wisdom', objective: 'Introduce the mentor who provides knowledge, tools, or encouragement' },
  { part: 5, name: 'Crossing the Threshold', step: 'Step 5: Commitment to Change', objective: 'The hero commits to the journey and enters a new world or situation' },
  { part: 6, name: 'Tests, Allies, and Enemies', step: 'Step 6: The Journey Begins', objective: 'The hero faces challenges, meets allies, and identifies obstacles' },
  { part: 7, name: 'Approach to the Inmost Cave', step: 'Step 7: Preparing for the Major Challenge', objective: 'The hero prepares for the biggest test or confrontation' },
  { part: 8, name: 'The Ordeal', step: 'Step 8: The Biggest Challenge', objective: 'The hero faces their greatest fear or challenge' },
  { part: 9, name: 'The Reward', step: 'Step 9: Achieving the Goal', objective: 'The hero achieves the goal and gains the reward or solution' },
  { part: 10, name: 'The Road Back', step: 'Step 10: Returning with New Knowledge', objective: 'The hero begins the journey back with newfound wisdom' },
  { part: 11, name: 'The Resurrection', step: 'Step 11: The Final Test', objective: 'The hero faces a final test to prove the transformation is complete' },
  { part: 12, name: 'Return with the Elixir', step: 'Step 12: Sharing the Transformation', objective: 'The hero returns transformed and shares the benefits with others' }
];

export class ScriptDetailAgent {
  private openai: OpenAI;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not set in environment variables');
    }
    this.openai = new OpenAI({ apiKey });
  }

  private calculateVideoCount(totalDuration: number, maxDuration: number): number {
    return Math.ceil(totalDuration / maxDuration);
  }

  private calculateVideoDuration(totalDuration: number, videoCount: number, videoIndex: number): number {
    const baseDuration = Math.floor(totalDuration / videoCount);
    const remainder = totalDuration % videoCount;
    return videoIndex < remainder ? baseDuration + 1 : baseDuration;
  }

  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  private generatePrompt(voice: string, visual: string): string {
    return `${visual}. Narration: "${voice}"`;
  }

  private buildSystemPrompt(language: string, videoCount: number): string {
    const languageNames: Record<string, string> = {
      'pt-br': 'Portuguese (Brazil)',
      'en': 'English',
      'es': 'Spanish',
      'it': 'Italian',
      'fr': 'French',
      'de': 'German'
    };

    return `You are a professional VSL (Video Sales Letter) scriptwriter specialized in the Hero's Journey framework.

Your task is to transform a simple VSL script into a detailed, engaging narrative following the 12-step Hero's Journey structure.

LANGUAGE: Write all content in ${languageNames[language] || language}

HERO'S JOURNEY FRAMEWORK (12 PARTS):
${HEROS_JOURNEY_PARTS.map(p => `${p.part}. ${p.name} - ${p.step}: ${p.objective}`).join('\n')}

OUTPUT REQUIREMENTS:
- Generate exactly ${videoCount} video scripts
- Each video must correspond to one or more Hero's Journey parts
- Distribute the 12 parts evenly across ${videoCount} videos
- Each video script MUST include:
  * partName: The Hero's Journey part name (e.g., "PART 1: The Ordinary World")
  * step: The step description (e.g., "Step 1: The Hero in Their World")
  * objective: What this part aims to achieve
  * voice: Compelling narration text (2-4 sentences)
  * example: A concrete scenario or example (1-2 sentences)
  * visual: Detailed visual description for AI video generation (1-2 sentences)

VISUAL DESCRIPTION GUIDELINES:
- Be specific about scenes, settings, and actions
- Use cinematic language (e.g., "close-up", "wide shot", "slow motion")
- Describe emotions and atmosphere
- Keep it concise but vivid (1-2 sentences max)

VOICE GUIDELINES:
- Write compelling, persuasive narration
- Use emotional triggers and storytelling
- Keep it conversational and engaging
- Match the product's tone and target audience

Return ONLY valid JSON matching this exact structure:
{
  "videos": [
    {
      "videoOrder": 1,
      "partName": "PART 1: The Ordinary World",
      "step": "Step 1: The Hero in Their World",
      "objective": "...",
      "voice": "...",
      "example": "...",
      "visual": "..."
    }
  ]
}`;
  }

  private buildUserPrompt(input: ScriptDetailInput, videoCount: number, videoDurations: number[]): string {
    return `ORIGINAL VSL SCRIPT:
${input.sectionContent}

PRODUCT: ${input.productContext?.productName || input.productContext?.productService || 'Not specified'}
TARGET AUDIENCE: ${input.productContext?.targetAudience || 'General audience'}
TONE: ${input.productContext?.tone || 'professional'}
TOTAL DURATION: ${input.totalDuration} seconds
NUMBER OF VIDEOS: ${videoCount}
VIDEO DURATIONS: ${videoDurations.map((d, i) => `Video ${i + 1}: ${d}s`).join(', ')}

Transform this VSL script into ${videoCount} detailed video scripts following the Hero's Journey framework.
Each video should be engaging, persuasive, and optimized for AI video generation.`;
  }

  async process(input: ScriptDetailInput): Promise<ScriptDetailOutput> {
    try {
      logger.info('[ScriptDetailAgent] Starting script generation', {
        projectId: input.projectId,
        sectionId: input.sectionId,
        totalDuration: input.totalDuration,
        modelId: input.modelId
      });

      // Get model configuration for maxDuration (simplified - could be from DB)
      const modelMaxDuration = 10; // seconds - adjust based on actual model
      const videoCount = this.calculateVideoCount(input.totalDuration, modelMaxDuration);
      const videoDurations = Array.from({ length: videoCount }, (_, i) =>
        this.calculateVideoDuration(input.totalDuration, videoCount, i)
      );

      logger.info('[ScriptDetailAgent] Video breakdown', { videoCount, videoDurations });

      const systemPrompt = this.buildSystemPrompt(input.language, videoCount);
      const userPrompt = this.buildUserPrompt(input, videoCount, videoDurations);

      logger.info('[ScriptDetailAgent] Calling OpenAI API');
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 4000
      });

      const responseText = completion.choices[0].message.content;
      if (!responseText) {
        return {
          success: false,
          message: 'Empty response from OpenAI',
          timestamp: new Date()
        };
      }

      logger.info('[ScriptDetailAgent] Received response from OpenAI');

      const parsedResponse = JSON.parse(responseText);
      const gptVideos = parsedResponse.videos || [];

      if (gptVideos.length !== videoCount) {
        logger.warn('[ScriptDetailAgent] Video count mismatch', {
          expected: videoCount,
          received: gptVideos.length
        });
      }

      let currentTime = 0;
      const videos: SectionVideoDetail[] = gptVideos.map((video: any, index: number) => {
        const duration = videoDurations[index] || videoDurations[0];
        const startTime = this.formatTime(currentTime);
        currentTime += duration;
        const endTime = this.formatTime(currentTime);

        const optimizedPrompt = this.generatePrompt(video.voice, video.visual);

        return {
          videoOrder: index + 1,
          startTime,
          endTime,
          duration,
          partName: video.partName || `PART ${index + 1}`,
          step: video.step || `Step ${index + 1}`,
          objective: video.objective || '',
          voice: video.voice || '',
          example: video.example || '',
          visual: video.visual || '',
          optimizedPrompt
        };
      });

      logger.info('[ScriptDetailAgent] Script generation complete', {
        videoCount: videos.length
      });

      return {
        success: true,
        message: 'Detailed script generated successfully',
        detailedScript: {
          language: input.language,
          totalDuration: input.totalDuration,
          videoCount: videos.length,
          videos,
          reasoning: `Generated ${videoCount} videos based on Hero's Journey framework to fit ${input.totalDuration}s total duration`
        },
        timestamp: new Date()
      };

    } catch (error: any) {
      logger.error('[ScriptDetailAgent] Error generating script', {
        error: error.message,
        stack: error.stack
      });

      return {
        success: false,
        message: `Failed to generate detailed script: ${error.message}`,
        timestamp: new Date()
      };
    }
  }
}
