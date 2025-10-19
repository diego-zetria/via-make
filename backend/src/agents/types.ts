/**
 * GPT-5 Multi-Agent System - Type Definitions
 *
 * Defines types for 3 specialized agents:
 * 1. Script Writer Specialist
 * 2. System Integration Specialist
 * 3. Fallback Error Handler
 */

export enum AgentRole {
  SCRIPT_WRITER = 'script_writer',
  SYSTEM_INTEGRATOR = 'system_integrator',
  FALLBACK_HANDLER = 'fallback_handler',
  VSL_SPECIALIST = 'vsl_specialist',
  LAMBDA_CONFIG = 'lambda_config',
}

export enum MessageType {
  REQUEST = 'request',
  RESPONSE = 'response',
  BROADCAST = 'broadcast',
  ERROR = 'error',
}

export enum MessagePriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

export interface AgentMessage {
  id: string;
  novelaId: string;
  fromAgent: AgentRole;
  toAgent?: AgentRole; // undefined = broadcast
  type: MessageType;
  priority: MessagePriority;
  content: string;
  metadata?: Record<string, any>;
  timestamp: Date;
  conversationId: string; // Groups related messages
}

export interface AgentResponse {
  success: boolean;
  message: string;
  data?: any;
  needsHelp?: boolean; // Flag for requesting assistance from other agents
  suggestedAgent?: AgentRole; // Which agent should handle next
  cost?: number;
  timestamp: Date;
}

export interface ScriptWriterInput {
  novelaId: string;
  sceneNumber: number;
  previousScenes?: string[];
  characterDescriptions?: Record<string, string>;
  plotPoints?: string[];
  tone?: string;
  duration?: number;
}

export interface ScriptWriterOutput extends AgentResponse {
  script?: {
    sceneDescription: string;
    visualPrompt: string;
    audioPrompt?: string;
    characterActions: string[];
    estimatedDuration: number;
  };
}

export interface SystemIntegratorInput {
  novelaId: string;
  videoRequest: {
    prompt: string;
    modelId?: string;
    duration?: number;
    resolution?: string;
    aspectRatio?: string;
  };
}

export interface SystemIntegratorOutput extends AgentResponse {
  estimation?: {
    modelId: string;
    estimatedCost: number;
    estimatedTime: number;
    lambdaEndpoint: string;
  };
  jobId?: string;
  status?: string;
}

export interface FallbackHandlerInput {
  novelaId: string;
  errorContext: {
    failedAgent: AgentRole;
    errorMessage: string;
    attemptedAction: string;
    metadata?: Record<string, any>;
  };
}

export interface FallbackHandlerOutput extends AgentResponse {
  resolution?: {
    strategy: string;
    alternativeApproach?: string;
    requiresHumanIntervention: boolean;
  };
  retryable?: boolean;
}

export interface AgentConfig {
  role: AgentRole;
  model: string;
  maxCompletionTokens: number;
  reasoningEffort: 'minimal' | 'low' | 'medium' | 'high';
  systemPrompt: string;
}

export interface ConversationContext {
  conversationId: string;
  novelaId: string;
  messages: AgentMessage[];
  currentAgent: AgentRole;
  startedAt: Date;
  lastActivityAt: Date;
}

export interface VSLSpecialistInput {
  projectId: string;
  templateId: 'pas' | 'aida' | 'story' | 'authority';
  sectionName: string;
  userContext?: {
    productService?: string;
    targetAudience?: string;
    mainProblem?: string;
    priceOffer?: string;
    tone?: string;
  };
  currentContent?: string; // For improvement suggestions
  requestType: 'generate' | 'improve' | 'score';
}

export interface VSLSpecialistOutput extends AgentResponse {
  sectionContent?: {
    content: string;
    persuasionScore: number;
    improvements: string[];
    hooks: string[];
  };
  aiSuggestion?: string;
  persuasionAnalysis?: {
    score: number;
    strengths: string[];
    weaknesses: string[];
    recommendations: string[];
  };
}

export interface LambdaConfigInput {
  projectId: string;
  mediaType: 'video' | 'image' | 'audio';
  requestType: 'suggest' | 'optimize';
  context?: {
    vslScript?: string;
    projectName?: string;
    targetAudience?: string;
    tone?: string;
    budget?: string; // e.g., "low", "medium", "high" or "$10-$50"
    qualityPriority?: 'cost' | 'balanced' | 'quality';
  };
  currentParams?: Record<string, any>; // For optimization requests
}

export interface LambdaConfigOutput extends AgentResponse {
  suggestedConfig?: {
    modelId: string;
    mediaType: 'video' | 'image' | 'audio';
    parameters: Record<string, any>;
  };
  reasoning?: string;
  alternatives?: Array<{
    modelId: string;
    why: string;
    costComparison: string;
  }>;
  estimatedCost?: number;
  estimatedTime?: number;
  recommendations?: string[];
  optimizedParams?: Record<string, any>;
  changes?: string[];
  costImpact?: string;
  qualityImpact?: string;
}
