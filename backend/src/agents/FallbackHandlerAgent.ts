/**
 * Agent 3: Fallback Error Handler
 *
 * System-wide problem solver with deep knowledge of the entire VSL platform.
 * Proactively analyzes errors and provides resolution strategies.
 *
 * Specializations:
 * - Comprehensive VSL system knowledge (frontend, backend, Lambda, Replicate)
 * - Error pattern recognition and root cause analysis
 * - Alternative solution generation
 * - Escalation and human intervention assessment
 * - Recovery strategies and retry logic
 * - Cross-agent coordination and conflict resolution
 */

import { BaseAgent } from './BaseAgent.js';
import {
  AgentRole,
  AgentConfig,
  FallbackHandlerInput,
  FallbackHandlerOutput,
  MessagePriority,
} from './types.js';
import { logger } from '../utils/logger.js';

interface ErrorPattern {
  pattern: RegExp;
  category: string;
  retryable: boolean;
  resolutionStrategy: string;
}

export class FallbackHandlerAgent extends BaseAgent {
  private errorPatterns: ErrorPattern[] = [];

  constructor() {
    const config: AgentConfig = {
      role: AgentRole.FALLBACK_HANDLER,
      model: process.env.OPENAI_MODEL || 'gpt-5',
      maxCompletionTokens: 1500, // Detailed problem solving
      reasoningEffort: 'medium', // Balanced analysis
      systemPrompt: `You are the Fallback Error Handler for the VSL Media Generation platform. You are the system's safety net and problem solver.

Your comprehensive knowledge includes:

SYSTEM ARCHITECTURE:
- Frontend: Next.js 15 + React 19 + Socket.IO client
- Backend: Express + TypeScript + Socket.IO + Prisma
- Database: PostgreSQL (vsl_frontend schema)
- Infrastructure: AWS Lambda + S3 + DynamoDB
- AI Models: GPT-5 (agents), Replicate (video generation)

AGENT RESPONSIBILITIES:
1. Script Writer: Creates novela scripts and visual prompts
2. System Integrator: Handles Lambda API calls and cost estimation
3. Fallback Handler (YOU): Solves problems from other agents

COMMON ERROR CATEGORIES:

1. GPT-5 API ERRORS:
   - Rate limits: Wait and retry with exponential backoff
   - Invalid parameters: Check GPT-5 parameter constraints
   - JSON parsing: Request re-generation with explicit format instructions

2. LAMBDA API ERRORS:
   - Timeout: Retry with longer timeout
   - 4xx errors: Check API parameters and authentication
   - 5xx errors: Retry with exponential backoff, escalate if persistent

3. REPLICATE MODEL ERRORS:
   - Invalid prompt: Simplify or shorten the visual prompt
   - Duration exceeded: Reduce duration or split into multiple scenes
   - Model unavailable: Suggest alternative model

4. DATABASE ERRORS:
   - Connection issues: Check DATABASE_URL and network
   - Constraint violations: Validate data before insertion
   - Transaction conflicts: Retry with optimistic locking

5. SCRIPT WRITER ERRORS:
   - Prompt too long: Ask for more concise scene description
   - JSON format issues: Provide explicit format example
   - Context overflow: Reduce previous scene history

6. SYSTEM INTEGRATOR ERRORS:
   - Cost calculation: Verify model pricing data
   - Model selection: Use fallback model (flux-schnell)
   - API authentication: Check REPLICATE_API_TOKEN

Your task is to:
1. Analyze the error context from the failed agent
2. Identify the error category and root cause
3. Determine if the error is retryable
4. Provide a specific resolution strategy
5. Assess if human intervention is required

Output format:
{
  "strategy": "Brief description of the resolution approach",
  "alternativeApproach": "Optional: Different way to achieve the goal",
  "requiresHumanIntervention": false,
  "retryable": true,
  "recommendedAction": "Specific steps to resolve the issue",
  "preventionSuggestion": "How to avoid this error in the future"
}`,
    };

    super(config);

    // Initialize error patterns
    this.initializeErrorPatterns();
  }

  /**
   * Initialize common error patterns
   */
  private initializeErrorPatterns(): void {
    this.errorPatterns = [
      {
        pattern: /rate limit|429|too many requests/i,
        category: 'Rate Limit',
        retryable: true,
        resolutionStrategy:
          'Wait 60 seconds and retry with exponential backoff',
      },
      {
        pattern: /timeout|ETIMEDOUT|ECONNRESET/i,
        category: 'Network Timeout',
        retryable: true,
        resolutionStrategy: 'Retry with increased timeout (2x current)',
      },
      {
        pattern: /JSON|parse|syntax/i,
        category: 'JSON Parsing',
        retryable: true,
        resolutionStrategy:
          'Request GPT-5 re-generation with explicit JSON format example',
      },
      {
        pattern: /401|unauthorized|authentication/i,
        category: 'Authentication',
        retryable: false,
        resolutionStrategy: 'Check API keys in environment variables',
      },
      {
        pattern: /prompt.*too long|context.*exceeded/i,
        category: 'Context Overflow',
        retryable: true,
        resolutionStrategy: 'Reduce context size or split into smaller requests',
      },
      {
        pattern: /model.*not found|model.*unavailable/i,
        category: 'Model Unavailable',
        retryable: true,
        resolutionStrategy: 'Use alternative model (flux-schnell as fallback)',
      },
      {
        pattern: /database|prisma|constraint/i,
        category: 'Database Error',
        retryable: true,
        resolutionStrategy: 'Validate data and retry transaction',
      },
    ];

    logger.info(
      `✅ Loaded ${this.errorPatterns.length} error pattern matchers`
    );
  }

  /**
   * Process fallback handling request
   */
  async process(input: FallbackHandlerInput): Promise<FallbackHandlerOutput> {
    try {
      logger.info(
        `🛟 Fallback Handler processing error from ${input.errorContext.failedAgent}`
      );

      // Check for known error patterns first
      const knownPattern = this.matchErrorPattern(
        input.errorContext.errorMessage
      );

      if (knownPattern) {
        logger.info(
          `✅ Matched known error pattern: ${knownPattern.category}`
        );

        // Use known resolution strategy
        const resolution = {
          strategy: knownPattern.resolutionStrategy,
          alternativeApproach: this.getAlternativeApproach(
            input.errorContext.failedAgent
          ),
          requiresHumanIntervention: !knownPattern.retryable,
          retryable: knownPattern.retryable,
          recommendedAction: knownPattern.resolutionStrategy,
          preventionSuggestion: 'Add input validation before API calls',
        };

        // Send resolution message
        await this.sendMessage(
          input.novelaId,
          `Error resolved: ${knownPattern.category} - ${resolution.strategy}`,
          input.errorContext.failedAgent, // Send back to failed agent
          input.novelaId,
          MessagePriority.HIGH,
          {
            errorCategory: knownPattern.category,
            retryable: resolution.retryable,
          }
        );

        return this.createSuccessResponse('Error resolution strategy found', {
          resolution,
        }) as FallbackHandlerOutput;
      }

      // Unknown error - use GPT-5 for analysis
      logger.info(`🤖 Using GPT-5 for unknown error analysis`);

      const userPrompt = this.buildFallbackPrompt(input);
      const response = await this.callGPT5(userPrompt, input.novelaId);

      // Parse JSON response
      let resolution;
      try {
        resolution = JSON.parse(response);
      } catch (parseError) {
        // Fallback: Try to extract JSON from markdown
        const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);
        if (jsonMatch) {
          resolution = JSON.parse(jsonMatch[1]);
        } else {
          throw new Error('GPT-5 response is not valid JSON');
        }
      }

      // Send resolution message
      await this.sendMessage(
        input.novelaId,
        `Error analyzed: ${resolution.strategy}`,
        input.errorContext.failedAgent,
        input.novelaId,
        resolution.requiresHumanIntervention
          ? MessagePriority.URGENT
          : MessagePriority.HIGH,
        {
          retryable: resolution.retryable,
          humanInterventionNeeded: resolution.requiresHumanIntervention,
        }
      );

      logger.info(`✅ Error resolution strategy generated`);

      return this.createSuccessResponse('Error analysis completed', {
        resolution,
        retryable: resolution.retryable,
      }) as FallbackHandlerOutput;
    } catch (error: any) {
      logger.error(`❌ Fallback Handler error:`, error.message);

      // This is critical - the fallback handler itself failed
      // Send urgent notification
      await this.sendMessage(
        input.novelaId,
        `CRITICAL: Fallback Handler failed: ${error.message}`,
        undefined, // broadcast to all
        input.novelaId,
        MessagePriority.URGENT,
        {
          error: error.message,
          requiresImmediateAttention: true,
        }
      );

      return this.createErrorResponse(error);
    }
  }

  /**
   * Match error message against known patterns
   */
  private matchErrorPattern(errorMessage: string): ErrorPattern | null {
    for (const pattern of this.errorPatterns) {
      if (pattern.pattern.test(errorMessage)) {
        return pattern;
      }
    }
    return null;
  }

  /**
   * Get alternative approach based on failed agent
   */
  private getAlternativeApproach(failedAgent: AgentRole): string {
    switch (failedAgent) {
      case AgentRole.SCRIPT_WRITER:
        return 'Use simpler scene description or reduce character count';
      case AgentRole.SYSTEM_INTEGRATOR:
        return 'Use flux-schnell model as fallback or reduce video duration';
      default:
        return 'Contact system administrator for manual intervention';
    }
  }

  /**
   * Build prompt for fallback analysis
   */
  private buildFallbackPrompt(input: FallbackHandlerInput): string {
    let prompt = `Analyze this error and provide a resolution strategy:\n\n`;
    prompt += `FAILED AGENT: ${input.errorContext.failedAgent}\n`;
    prompt += `ERROR MESSAGE: ${input.errorContext.errorMessage}\n`;
    prompt += `ATTEMPTED ACTION: ${input.errorContext.attemptedAction}\n\n`;

    if (input.errorContext.metadata) {
      prompt += `ADDITIONAL CONTEXT:\n`;
      prompt += JSON.stringify(input.errorContext.metadata, null, 2);
      prompt += `\n\n`;
    }

    prompt += `Provide your analysis in the JSON format specified in your system prompt. Be specific and actionable.`;

    return prompt;
  }
}
