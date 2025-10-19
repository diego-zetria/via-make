/**
 * Agent 4: VSL (Video Sales Letter) Specialist
 *
 * Expert in creating high-converting Video Sales Letters using proven marketing frameworks.
 * Specializes in copywriting, persuasion psychology, and conversion optimization.
 *
 * Specializations:
 * - VSL frameworks: PAS, AIDA, Story, Authority
 * - Copywriting and persuasion techniques
 * - Hook creation and attention retention
 * - Pain point amplification and desire building
 * - Call-to-action optimization
 * - Persuasion scoring and content analysis
 */

import { BaseAgent } from './BaseAgent.js';
import {
  AgentRole,
  AgentConfig,
  VSLSpecialistInput,
  VSLSpecialistOutput,
  MessagePriority,
} from './types.js';
import { logger } from '../utils/logger.js';
import { SuccessLogger } from '../utils/successLogger.js';

export class VSLSpecialistAgent extends BaseAgent {
  constructor() {
    const config: AgentConfig = {
      role: AgentRole.VSL_SPECIALIST,
      model: process.env.OPENAI_MODEL || 'gpt-5',
      maxCompletionTokens: 10000, // Increased: 3000 for reasoning + 7000 for response
      reasoningEffort: 'high', // High reasoning for persuasive content
      systemPrompt: `You are an elite VSL (Video Sales Letter) copywriting specialist and marketing expert.

Your expertise includes:
- Mastery of proven VSL frameworks: PAS (Problem-Agitate-Solution), AIDA (Attention-Interest-Desire-Action), Story (Personal Journey), Authority (Expert-Driven Proof)
- Deep understanding of persuasion psychology and emotional triggers
- Creating compelling hooks that grab attention immediately
- Pain point amplification and desire building techniques
- Crafting irresistible offers and clear call-to-actions
- Analyzing and scoring copy for persuasion effectiveness
- Conversion optimization and A/B testing insights

VSL FRAMEWORKS:

1. PAS (Problem-Agitate-Solution):
   - Problem: Identify specific, relatable problem
   - Agitate: Amplify pain, show consequences of inaction
   - Solution: Present product as perfect answer

2. AIDA (Attention-Interest-Desire-Action):
   - Attention: Hook with bold claim or question
   - Interest: Show what's possible, build curiosity
   - Desire: Create emotional want through proof/benefits
   - Action: Clear CTA with urgency

3. STORY (Personal Journey):
   - Story: Authentic personal struggle
   - Journey: Path of discovery and obstacles
   - Transform: Dramatic before/after results
   - Offer: Share solution that created transformation

4. AUTHORITY (Expert-Driven Proof):
   - Credentials: Establish expertise and authority
   - Cases: Concrete success stories and metrics
   - Proof: Social proof, testimonials, data
   - Offer: Exclusive access to proven system

PERSUASION SCORING (0-100):
- 0-30: Weak, generic, lacks emotional connection
- 31-60: Decent but needs improvement
- 61-80: Good, compelling, persuasive
- 81-100: Exceptional, highly converting

Scoring factors:
- Emotional resonance (20 points)
- Specificity and concrete details (15 points)
- Unique value proposition clarity (15 points)
- Social proof integration (10 points)
- Urgency and scarcity (10 points)
- Clear and compelling CTA (10 points)
- Pain point amplification (10 points)
- Benefit-focused language (10 points)

CRITICAL RULES:
1. ALWAYS return ONLY valid JSON - no markdown, no code blocks, pure JSON
2. Be specific, never generic
3. Use emotional triggers authentically
4. Focus on transformation, not just features
5. Include concrete numbers and examples
6. Create urgency without being pushy
7. Make every word count

IMPORTANT: You MUST respond with valid JSON only. Do not wrap in markdown code blocks.

Output format for 'generate' requests:
{
  "content": "The VSL section content...",
  "persuasionScore": 85,
  "hooks": ["Hook 1...", "Hook 2..."],
  "improvements": ["Suggestion 1...", "Suggestion 2..."],
  "strengths": ["What works well..."],
  "weaknesses": ["What could improve..."]
}

Output format for 'improve' requests:
{
  "improvedContent": "Enhanced version...",
  "aiSuggestion": "Specific improvement explanation...",
  "persuasionScore": 90,
  "changes": ["Change 1...", "Change 2..."]
}

Output format for 'score' requests:
{
  "score": 75,
  "strengths": ["Strength 1...", "Strength 2..."],
  "weaknesses": ["Weakness 1...", "Weakness 2..."],
  "recommendations": ["Fix 1...", "Fix 2..."]
}`,
    };

    super(config);
  }

  /**
   * Process VSL content generation, improvement, or scoring request
   */
  async process(input: VSLSpecialistInput): Promise<VSLSpecialistOutput> {
    try {
      SuccessLogger.start(`VSL Specialist - ${input.requestType} for ${input.sectionName}`);

      // Build context-rich prompt based on request type
      const userPrompt = this.buildVSLPrompt(input);

      // Call GPT-5
      const response = await this.callGPT5(userPrompt, input.projectId);

      // Parse JSON response
      let vslData;
      try {
        vslData = JSON.parse(response);
      } catch (parseError) {
        logger.error('❌ Failed to parse GPT-5 response as JSON');

        // Fallback: Try to extract JSON from markdown code blocks
        const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);
        if (jsonMatch) {
          vslData = JSON.parse(jsonMatch[1]);
        } else {
          throw new Error('GPT-5 response is not valid JSON');
        }
      }

      // Send message to Communication Bus
      await this.sendMessage(
        input.projectId,
        `VSL ${input.requestType} completed for section: ${input.sectionName}`,
        undefined, // broadcast
        input.projectId,
        MessagePriority.MEDIUM,
        {
          templateId: input.templateId,
          sectionName: input.sectionName,
          requestType: input.requestType,
          persuasionScore: vslData.persuasionScore || vslData.score || 0,
        }
      );

      SuccessLogger.success(`VSL Specialist - ${input.requestType} for ${input.sectionName}`, {
        requestType: input.requestType,
        sectionName: input.sectionName,
        persuasionScore: vslData.persuasionScore || vslData.score || 0,
      });

      // Format response based on request type
      if (input.requestType === 'generate') {
        return this.createSuccessResponse(
          `VSL content generated for ${input.sectionName}`,
          {
            sectionContent: {
              content: vslData.content || '',
              persuasionScore: vslData.persuasionScore || 0,
              improvements: vslData.improvements || [],
              hooks: vslData.hooks || [],
            },
            persuasionAnalysis: {
              score: vslData.persuasionScore || 0,
              strengths: vslData.strengths || [],
              weaknesses: vslData.weaknesses || [],
              recommendations: vslData.improvements || [],
            },
          }
        ) as VSLSpecialistOutput;
      } else if (input.requestType === 'improve') {
        return this.createSuccessResponse(
          `VSL content improved for ${input.sectionName}`,
          {
            sectionContent: {
              content: vslData.improvedContent || vslData.content || '',
              persuasionScore: vslData.persuasionScore || 0,
              improvements: vslData.changes || [],
              hooks: [],
            },
            aiSuggestion: vslData.aiSuggestion || '',
          }
        ) as VSLSpecialistOutput;
      } else {
        // score request
        return this.createSuccessResponse(
          `VSL content scored for ${input.sectionName}`,
          {
            persuasionAnalysis: {
              score: vslData.score || 0,
              strengths: vslData.strengths || [],
              weaknesses: vslData.weaknesses || [],
              recommendations: vslData.recommendations || [],
            },
          }
        ) as VSLSpecialistOutput;
      }
    } catch (error: any) {
      SuccessLogger.error(`VSL Specialist - ${input.requestType} for ${input.sectionName}`, error);

      // Request help from Fallback Handler
      await this.sendMessage(
        input.projectId,
        `VSL ${input.requestType} failed for ${input.sectionName}: ${error.message}`,
        AgentRole.FALLBACK_HANDLER,
        input.projectId,
        MessagePriority.HIGH,
        {
          error: error.message,
          sectionName: input.sectionName,
          requestType: input.requestType,
        }
      );

      return this.createErrorResponse(error);
    }
  }

  /**
   * Build comprehensive prompt for VSL content generation
   */
  private buildVSLPrompt(input: VSLSpecialistInput): string {
    const { requestType, templateId, sectionName, userContext, currentContent } = input;

    let prompt = '';

    if (requestType === 'generate') {
      prompt = `Create compelling VSL content for the "${sectionName}" section of a ${templateId.toUpperCase()} framework VSL.\n\n`;

      // Add user context
      if (userContext) {
        prompt += `CONTEXT:\n`;
        if (userContext.productService) {
          prompt += `Product/Service: ${userContext.productService}\n`;
        }
        if (userContext.targetAudience) {
          prompt += `Target Audience: ${userContext.targetAudience}\n`;
        }
        if (userContext.mainProblem) {
          prompt += `Main Problem: ${userContext.mainProblem}\n`;
        }
        if (userContext.priceOffer) {
          prompt += `Price/Offer: ${userContext.priceOffer}\n`;
        }
        if (userContext.tone) {
          prompt += `Tone: ${userContext.tone}\n`;
        }
        prompt += `\n`;
      }

      prompt += `TASK: Write ${sectionName} section following ${templateId.toUpperCase()} framework principles.\n\n`;
      prompt += `Focus on:\n`;
      prompt += `- Strong emotional connection\n`;
      prompt += `- Specific, concrete examples\n`;
      prompt += `- Authentic storytelling\n`;
      prompt += `- Clear value proposition\n`;
      prompt += `- Persuasive language\n\n`;
      prompt += `Generate content following the JSON format for 'generate' requests in your system prompt.`;

    } else if (requestType === 'improve') {
      prompt = `Improve this ${sectionName} section for a ${templateId.toUpperCase()} framework VSL.\n\n`;

      prompt += `CURRENT CONTENT:\n${currentContent}\n\n`;

      if (userContext) {
        prompt += `CONTEXT:\n`;
        if (userContext.productService) {
          prompt += `Product: ${userContext.productService}\n`;
        }
        if (userContext.targetAudience) {
          prompt += `Audience: ${userContext.targetAudience}\n`;
        }
        prompt += `\n`;
      }

      prompt += `TASK: Enhance this content for better conversion. Make it more:\n`;
      prompt += `- Emotionally compelling\n`;
      prompt += `- Specific and concrete\n`;
      prompt += `- Benefit-focused\n`;
      prompt += `- Persuasive\n\n`;
      prompt += `Follow the JSON format for 'improve' requests in your system prompt.`;

    } else {
      // score request
      prompt = `Analyze and score this ${sectionName} section from a ${templateId.toUpperCase()} framework VSL.\n\n`;

      prompt += `CONTENT TO SCORE:\n${currentContent}\n\n`;

      prompt += `TASK: Provide detailed persuasion analysis using the 0-100 scoring system from your system prompt.\n`;
      prompt += `Be honest and constructive. Follow the JSON format for 'score' requests.`;
    }

    return prompt;
  }
}
