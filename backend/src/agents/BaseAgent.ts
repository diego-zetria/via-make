/**
 * BaseAgent - Abstract base class for all GPT-5 agents
 *
 * Provides common functionality:
 * - GPT-5 API communication
 * - Message handling
 * - Conversation context management
 * - Error handling
 */

import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';
import {
  AgentRole,
  AgentConfig,
  AgentMessage,
  AgentResponse,
  MessageType,
  MessagePriority,
} from './types.js';
import { prisma } from '../config/database.js';

export abstract class BaseAgent {
  protected config: AgentConfig;
  protected openai: OpenAI;
  protected conversationHistory: Map<string, AgentMessage[]> = new Map();

  constructor(config: AgentConfig) {
    this.config = config;

    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not set in environment variables');
    }

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    logger.info(`✅ Agent initialized: ${config.role}`);
  }

  /**
   * Main entry point for agent processing
   */
  abstract process(input: any): Promise<AgentResponse>;

  /**
   * Call GPT-5 with agent-specific configuration
   */
  protected async callGPT5(
    userMessage: string,
    conversationId?: string
  ): Promise<string> {
    try {
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: this.config.systemPrompt,
        },
      ];

      // Add conversation history if available
      if (conversationId && this.conversationHistory.has(conversationId)) {
        const history = this.conversationHistory.get(conversationId)!;
        history.forEach((msg) => {
          messages.push({
            role: msg.fromAgent === this.config.role ? 'assistant' : 'user',
            content: msg.content,
          });
        });
      }

      // Add current user message
      messages.push({
        role: 'user',
        content: userMessage,
      });

      logger.info(`🤖 ${this.config.role} calling GPT-5...`);

      // GPT-5 API call with supported parameters only
      // NO temperature, top_p, presence_penalty, frequency_penalty, logprobs
      const response = await this.openai.chat.completions.create({
        model: this.config.model,
        messages: messages,
        max_completion_tokens: this.config.maxCompletionTokens,
        reasoning_effort: this.config.reasoningEffort,
        response_format: { type: 'json_object' }, // Force JSON mode to fix empty response bug
      });

      const content = response.choices[0].message.content || '';

      logger.info(
        `✅ ${this.config.role} received response (${content.length} chars)`
      );

      // Log full response if empty or very short
      if (content.length < 50) {
        logger.warn(`⚠️ Short/empty response from GPT-5:`);
        logger.warn(`Response object: ${JSON.stringify(response, null, 2)}`);
        logger.warn(`Content: "${content}"`);
        logger.warn(`Finish reason: ${response.choices[0].finish_reason}`);
      }

      return content;
    } catch (error: any) {
      logger.error(`❌ ${this.config.role} GPT-5 call failed:`, error.message);
      logger.error(`Error details: ${JSON.stringify(error, null, 2)}`);
      throw new Error(`GPT-5 API error: ${error.message}`);
    }
  }

  /**
   * Send a message to another agent or broadcast
   */
  async sendMessage(
    novelaId: string,
    content: string,
    toAgent?: AgentRole,
    conversationId?: string,
    priority: MessagePriority = MessagePriority.MEDIUM,
    metadata?: Record<string, any>
  ): Promise<AgentMessage> {
    const message: AgentMessage = {
      id: uuidv4(),
      novelaId,
      fromAgent: this.config.role,
      toAgent,
      type: toAgent ? MessageType.REQUEST : MessageType.BROADCAST,
      priority,
      content,
      metadata,
      timestamp: new Date(),
      conversationId: conversationId || uuidv4(),
    };

    // Store in conversation history
    if (!this.conversationHistory.has(message.conversationId)) {
      this.conversationHistory.set(message.conversationId, []);
    }
    this.conversationHistory.get(message.conversationId)!.push(message);

    // Validate novelaId exists before persisting
    const validatedNovelaId = await this.validateNovelaId(message.novelaId);

    // Persist to database
    await prisma.agentMessage.create({
      data: {
        id: message.id,
        novelaId: validatedNovelaId, // Use validated ID (can be null)
        fromAgent: message.fromAgent,
        toAgent: message.toAgent,
        type: message.type,
        priority: message.priority,
        content: message.content,
        metadata: message.metadata || {},
        conversationId: message.conversationId,
        timestamp: message.timestamp,
      },
    });

    logger.info(
      `📨 ${this.config.role} sent message to ${toAgent || 'ALL'}: ${message.id}${validatedNovelaId ? ` (novela: ${validatedNovelaId})` : ' (no novela)'}`
    );

    return message;
  }

  /**
   * Validate if novela exists, return null if not
   */
  private async validateNovelaId(novelaId: string): Promise<string | null> {
    try {
      const novela = await prisma.novela.findUnique({
        where: { id: novelaId },
        select: { id: true },
      });
      return novela ? novelaId : null;
    } catch (error) {
      logger.warn(`⚠️ Could not validate novelaId ${novelaId}: ${error}`);
      return null;
    }
  }

  /**
   * Get conversation history for a specific conversation
   */
  getConversationHistory(conversationId: string): AgentMessage[] {
    return this.conversationHistory.get(conversationId) || [];
  }

  /**
   * Clear conversation history
   */
  clearConversationHistory(conversationId: string): void {
    this.conversationHistory.delete(conversationId);
    logger.info(`🗑️ Cleared conversation history: ${conversationId}`);
  }

  /**
   * Get agent role
   */
  getRole(): AgentRole {
    return this.config.role;
  }

  /**
   * Get agent configuration
   */
  getConfig(): AgentConfig {
    return { ...this.config };
  }

  /**
   * Helper to create standardized error response
   */
  protected createErrorResponse(error: Error | string): AgentResponse {
    const errorMessage = typeof error === 'string' ? error : error.message;

    return {
      success: false,
      message: errorMessage,
      needsHelp: true,
      suggestedAgent: AgentRole.FALLBACK_HANDLER,
      timestamp: new Date(),
    };
  }

  /**
   * Helper to create standardized success response
   */
  protected createSuccessResponse(
    message: string,
    data?: any
  ): AgentResponse {
    return {
      success: true,
      message,
      data,
      timestamp: new Date(),
    };
  }
}
