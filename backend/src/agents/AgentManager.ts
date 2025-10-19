/**
 * Agent Manager - Multi-Agent System Coordinator
 *
 * Initializes and manages all GPT-5 agents and the communication bus.
 * Provides high-level API for agent orchestration.
 *
 * Features:
 * - Agent lifecycle management
 * - Communication bus coordination
 * - Workflow orchestration
 * - Error handling and recovery
 */

import { Server as SocketIOServer } from 'socket.io';
import { logger } from '../utils/logger.js';
import { CommunicationBus } from './CommunicationBus.js';
import { ScriptWriterAgent } from './ScriptWriterAgent.js';
import { SystemIntegratorAgent } from './SystemIntegratorAgent.js';
import { FallbackHandlerAgent } from './FallbackHandlerAgent.js';
import { VSLSpecialistAgent } from './VSLSpecialistAgent.js';
import { LambdaConfigAgent } from './LambdaConfigAgent.js';
import {
  AgentRole,
  ScriptWriterInput,
  ScriptWriterOutput,
  SystemIntegratorInput,
  SystemIntegratorOutput,
  FallbackHandlerInput,
  FallbackHandlerOutput,
  VSLSpecialistInput,
  VSLSpecialistOutput,
  LambdaConfigInput,
  LambdaConfigOutput,
} from './types.js';

export class AgentManager {
  private communicationBus: CommunicationBus;
  private scriptWriter: ScriptWriterAgent;
  private systemIntegrator: SystemIntegratorAgent;
  private fallbackHandler: FallbackHandlerAgent;
  private vslSpecialist: VSLSpecialistAgent;
  private lambdaConfig: LambdaConfigAgent;
  private initialized: boolean = false;

  constructor(io: SocketIOServer) {
    // Initialize Communication Bus
    this.communicationBus = new CommunicationBus(io);

    // Initialize Agents
    this.scriptWriter = new ScriptWriterAgent();
    this.systemIntegrator = new SystemIntegratorAgent();
    this.fallbackHandler = new FallbackHandlerAgent();
    this.vslSpecialist = new VSLSpecialistAgent();
    this.lambdaConfig = new LambdaConfigAgent();

    logger.info('✅ Agent Manager created');
  }

  /**
   * Initialize agent system
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn('⚠️ Agent Manager already initialized');
      return;
    }

    try {
      logger.info('🚀 Initializing Agent Manager...');

      // Subscribe agents to communication bus
      this.communicationBus.subscribe(AgentRole.SCRIPT_WRITER, (message) => {
        logger.info(
          `📨 Script Writer received message from ${message.fromAgent}`
        );
        // Agent-specific message handling logic can be added here
      });

      this.communicationBus.subscribe(
        AgentRole.SYSTEM_INTEGRATOR,
        (message) => {
          logger.info(
            `📨 System Integrator received message from ${message.fromAgent}`
          );
        }
      );

      this.communicationBus.subscribe(AgentRole.FALLBACK_HANDLER, (message) => {
        logger.info(
          `📨 Fallback Handler received message from ${message.fromAgent}`
        );
      });

      this.communicationBus.subscribe(AgentRole.VSL_SPECIALIST, (message) => {
        logger.info(
          `📨 VSL Specialist received message from ${message.fromAgent}`
        );
      });

      this.communicationBus.subscribe(AgentRole.LAMBDA_CONFIG, (message) => {
        logger.info(
          `📨 Lambda Config Agent received message from ${message.fromAgent}`
        );
      });

      this.initialized = true;
      logger.info('✅ Agent Manager initialized successfully');
    } catch (error: any) {
      logger.error('❌ Failed to initialize Agent Manager:', error.message);
      throw error;
    }
  }

  /**
   * Generate script for a scene
   */
  async generateScript(
    input: ScriptWriterInput
  ): Promise<ScriptWriterOutput> {
    this.ensureInitialized();
    return await this.scriptWriter.process(input);
  }

  /**
   * Get video generation estimation
   */
  async getVideoEstimation(
    input: SystemIntegratorInput
  ): Promise<SystemIntegratorOutput> {
    this.ensureInitialized();
    return await this.systemIntegrator.process(input);
  }

  /**
   * Start video generation
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
    this.ensureInitialized();
    return await this.systemIntegrator.startVideoGeneration(
      novelaId,
      videoRequest
    );
  }

  /**
   * Handle error with fallback agent
   */
  async handleError(
    input: FallbackHandlerInput
  ): Promise<FallbackHandlerOutput> {
    this.ensureInitialized();
    return await this.fallbackHandler.process(input);
  }

  /**
   * Generate VSL content with VSL Specialist Agent
   */
  async generateVSLContent(
    input: VSLSpecialistInput
  ): Promise<VSLSpecialistOutput> {
    this.ensureInitialized();
    return await this.vslSpecialist.process(input);
  }

  /**
   * Get intelligent Lambda configuration suggestions
   */
  async suggestLambdaConfig(
    input: LambdaConfigInput
  ): Promise<LambdaConfigOutput> {
    this.ensureInitialized();
    return await this.lambdaConfig.process(input);
  }

  /**
   * Complete workflow: Script → Estimation → Video Generation
   */
  async generateSceneVideo(input: {
    novelaId: string;
    sceneNumber: number;
    previousScenes?: string[];
    characterDescriptions?: Record<string, string>;
    plotPoints?: string[];
    tone?: string;
    duration?: number;
    modelId?: string;
  }): Promise<{
    script: ScriptWriterOutput;
    estimation: SystemIntegratorOutput;
    videoJob?: SystemIntegratorOutput;
  }> {
    this.ensureInitialized();

    try {
      logger.info(
        `🎬 Starting complete workflow for scene ${input.sceneNumber}`
      );

      // Step 1: Generate script
      logger.info('📝 Step 1: Generating script...');
      const scriptResult = await this.scriptWriter.process({
        novelaId: input.novelaId,
        sceneNumber: input.sceneNumber,
        previousScenes: input.previousScenes,
        characterDescriptions: input.characterDescriptions,
        plotPoints: input.plotPoints,
        tone: input.tone,
        duration: input.duration,
      });

      if (!scriptResult.success) {
        throw new Error(`Script generation failed: ${scriptResult.message}`);
      }

      // Step 2: Get video estimation
      logger.info('💰 Step 2: Getting video estimation...');
      const estimationResult = await this.systemIntegrator.process({
        novelaId: input.novelaId,
        videoRequest: {
          prompt: scriptResult.data!.script.visualPrompt,
          modelId: input.modelId,
          duration: scriptResult.data!.script.estimatedDuration,
        },
      });

      if (!estimationResult.success) {
        throw new Error(
          `Video estimation failed: ${estimationResult.message}`
        );
      }

      logger.info('✅ Complete workflow finished successfully');

      return {
        script: scriptResult,
        estimation: estimationResult,
      };
    } catch (error: any) {
      logger.error('❌ Complete workflow failed:', error.message);

      // Trigger fallback handler
      const fallbackResult = await this.fallbackHandler.process({
        novelaId: input.novelaId,
        errorContext: {
          failedAgent: AgentRole.SCRIPT_WRITER, // or detect which step failed
          errorMessage: error.message,
          attemptedAction: 'Complete scene video generation workflow',
          metadata: { sceneNumber: input.sceneNumber },
        },
      });

      throw new Error(
        `Workflow failed: ${error.message}. Fallback: ${fallbackResult.data?.resolution?.strategy}`
      );
    }
  }

  /**
   * Get communication bus stats
   */
  getStats() {
    return this.communicationBus.getStats();
  }

  /**
   * Get conversation history
   */
  async getConversationMessages(conversationId: string) {
    return await this.communicationBus.getConversationMessages(conversationId);
  }

  /**
   * Cleanup old conversations
   */
  cleanup(olderThanHours: number = 24) {
    this.communicationBus.cleanupOldConversations(olderThanHours);
  }

  /**
   * Shutdown agent system
   */
  shutdown() {
    logger.info('🛑 Shutting down Agent Manager...');
    this.communicationBus.unsubscribe(AgentRole.SCRIPT_WRITER);
    this.communicationBus.unsubscribe(AgentRole.SYSTEM_INTEGRATOR);
    this.communicationBus.unsubscribe(AgentRole.FALLBACK_HANDLER);
    this.communicationBus.unsubscribe(AgentRole.VSL_SPECIALIST);
    this.communicationBus.unsubscribe(AgentRole.LAMBDA_CONFIG);
    this.initialized = false;
    logger.info('✅ Agent Manager shut down');
  }

  /**
   * Ensure system is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error(
        'Agent Manager not initialized. Call initialize() first.'
      );
    }
  }
}
