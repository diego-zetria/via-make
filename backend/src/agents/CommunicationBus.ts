/**
 * Communication Bus - Inter-Agent Message Coordinator
 *
 * Centralized message routing system for GPT-5 multi-agent communication.
 * Handles message delivery, broadcasting, and Socket.IO frontend updates.
 *
 * Features:
 * - Message routing between agents
 * - Priority-based message queuing
 * - Real-time frontend updates via Socket.IO
 * - Conversation context tracking
 * - Message persistence to database
 */

import { EventEmitter } from 'events';
import { Server as SocketIOServer } from 'socket.io';
import { logger } from '../utils/logger.js';
import { prisma } from '../config/database.js';
import {
  AgentRole,
  AgentMessage,
  MessageType,
  MessagePriority,
  ConversationContext,
} from './types.js';

export class CommunicationBus extends EventEmitter {
  private io: SocketIOServer;
  private conversations: Map<string, ConversationContext> = new Map();
  private messageQueue: Map<MessagePriority, AgentMessage[]> = new Map();

  constructor(io: SocketIOServer) {
    super();
    this.io = io;

    // Initialize priority queues
    this.messageQueue.set(MessagePriority.URGENT, []);
    this.messageQueue.set(MessagePriority.HIGH, []);
    this.messageQueue.set(MessagePriority.MEDIUM, []);
    this.messageQueue.set(MessagePriority.LOW, []);

    logger.info('✅ Communication Bus initialized');
  }

  /**
   * Publish a message to the bus
   */
  async publish(message: AgentMessage): Promise<void> {
    try {
      logger.info(
        `📨 Message published: ${message.fromAgent} → ${message.toAgent || 'ALL'} [${message.priority}]`
      );

      // Add to priority queue
      this.messageQueue.get(message.priority)!.push(message);

      // Update conversation context
      this.updateConversation(message);

      // Persist to database
      await this.persistMessage(message);

      // Broadcast to Socket.IO frontend
      this.broadcastToFrontend(message);

      // Emit event for agent listeners
      if (message.toAgent) {
        // Direct message to specific agent
        this.emit(`message:${message.toAgent}`, message);
      } else {
        // Broadcast to all agents
        this.emit('message:broadcast', message);
      }
    } catch (error: any) {
      logger.error(`❌ Failed to publish message:`, error.message);
      throw error;
    }
  }

  /**
   * Subscribe an agent to receive messages
   */
  subscribe(
    agentRole: AgentRole,
    handler: (message: AgentMessage) => void
  ): void {
    // Subscribe to direct messages
    this.on(`message:${agentRole}`, handler);

    // Subscribe to broadcasts
    this.on('message:broadcast', (message: AgentMessage) => {
      // Don't send broadcast back to sender
      if (message.fromAgent !== agentRole) {
        handler(message);
      }
    });

    logger.info(`✅ Agent subscribed: ${agentRole}`);
  }

  /**
   * Unsubscribe an agent from messages
   */
  unsubscribe(agentRole: AgentRole): void {
    this.removeAllListeners(`message:${agentRole}`);
    logger.info(`❌ Agent unsubscribed: ${agentRole}`);
  }

  /**
   * Get conversation context
   */
  getConversation(conversationId: string): ConversationContext | undefined {
    return this.conversations.get(conversationId);
  }

  /**
   * Get all messages for a conversation
   */
  async getConversationMessages(
    conversationId: string
  ): Promise<AgentMessage[]> {
    const messages = await prisma.agentMessage.findMany({
      where: { conversationId },
      orderBy: { timestamp: 'asc' },
    });

    return messages.map((msg) => ({
      id: msg.id,
      novelaId: msg.novelaId,
      fromAgent: msg.fromAgent as AgentRole,
      toAgent: msg.toAgent as AgentRole | undefined,
      type: msg.type as MessageType,
      priority: msg.priority as MessagePriority,
      content: msg.content,
      metadata: msg.metadata as Record<string, any>,
      timestamp: msg.timestamp,
      conversationId: msg.conversationId,
    }));
  }

  /**
   * Get messages by priority
   */
  getMessagesByPriority(priority: MessagePriority): AgentMessage[] {
    return this.messageQueue.get(priority) || [];
  }

  /**
   * Clear messages for a priority level
   */
  clearPriorityQueue(priority: MessagePriority): void {
    this.messageQueue.set(priority, []);
    logger.info(`🗑️ Cleared ${priority} priority queue`);
  }

  /**
   * Update conversation context
   */
  private updateConversation(message: AgentMessage): void {
    let conversation = this.conversations.get(message.conversationId);

    if (!conversation) {
      conversation = {
        conversationId: message.conversationId,
        novelaId: message.novelaId,
        messages: [],
        currentAgent: message.fromAgent,
        startedAt: new Date(),
        lastActivityAt: new Date(),
      };
      this.conversations.set(message.conversationId, conversation);
    }

    conversation.messages.push(message);
    conversation.currentAgent = message.fromAgent;
    conversation.lastActivityAt = new Date();
  }

  /**
   * Persist message to database
   */
  private async persistMessage(message: AgentMessage): Promise<void> {
    try {
      await prisma.agentMessage.create({
        data: {
          id: message.id,
          novelaId: message.novelaId,
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
    } catch (error: any) {
      logger.error(`❌ Failed to persist message:`, error.message);
      // Don't throw - message is still in memory
    }
  }

  /**
   * Broadcast message to frontend via Socket.IO
   */
  private broadcastToFrontend(message: AgentMessage): void {
    try {
      // Emit to novela-specific room
      this.io.to(`novela:${message.novelaId}`).emit('agent:message', {
        id: message.id,
        fromAgent: message.fromAgent,
        toAgent: message.toAgent,
        type: message.type,
        priority: message.priority,
        content: message.content,
        timestamp: message.timestamp,
        conversationId: message.conversationId,
      });

      // Also emit agent-specific events for UI updates
      this.io
        .to(`novela:${message.novelaId}`)
        .emit(`agent:${message.fromAgent}:update`, {
          status: 'active',
          message: message.content.substring(0, 100), // Preview
          timestamp: message.timestamp,
        });
    } catch (error: any) {
      logger.error(`❌ Failed to broadcast to frontend:`, error.message);
      // Don't throw - agents can still communicate
    }
  }

  /**
   * Clean up old conversations
   */
  cleanupOldConversations(olderThanHours: number = 24): void {
    const cutoffTime = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
    let cleaned = 0;

    for (const [id, conversation] of this.conversations.entries()) {
      if (conversation.lastActivityAt < cutoffTime) {
        this.conversations.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info(`🗑️ Cleaned up ${cleaned} old conversations`);
    }
  }

  /**
   * Get statistics
   */
  getStats(): {
    activeConversations: number;
    totalMessages: number;
    messagesByPriority: Record<MessagePriority, number>;
  } {
    return {
      activeConversations: this.conversations.size,
      totalMessages: Array.from(this.conversations.values()).reduce(
        (total, conv) => total + conv.messages.length,
        0
      ),
      messagesByPriority: {
        [MessagePriority.URGENT]: this.messageQueue.get(MessagePriority.URGENT)!
          .length,
        [MessagePriority.HIGH]: this.messageQueue.get(MessagePriority.HIGH)!
          .length,
        [MessagePriority.MEDIUM]: this.messageQueue.get(MessagePriority.MEDIUM)!
          .length,
        [MessagePriority.LOW]: this.messageQueue.get(MessagePriority.LOW)!
          .length,
      },
    };
  }
}
