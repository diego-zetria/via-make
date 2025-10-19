# VSL Frontend System - Technical Design Specification

**Document Version:** 1.0.0
**Date:** 2025-10-18
**Status:** Design Phase

---

## 📋 Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Architecture](#system-architecture)
3. [GPT-5 Multi-Agent System](#gpt-5-multi-agent-system)
4. [Database Schema](#database-schema)
5. [Frontend Design](#frontend-design)
6. [API Design](#api-design)
7. [Integration Points](#integration-points)
8. [Security & Authentication](#security--authentication)
9. [Implementation Roadmap](#implementation-roadmap)

---

## Executive Summary

### Project Goal
Create a modern, minimalist web frontend for the VSL Media Generation System with GPT-5-powered multi-agent intelligence for creating mini-series and soap operas (novelas).

### Key Requirements
- ✅ **GPT-5 Integration**: MUST use GPT-5 model (NOT gpt-4, gpt-4o, or gpt-4.1)
- ✅ **Multi-Agent System**: 3 specialized AI agents that communicate with each other
- ✅ **Minimalist UI**: Clean, modern interface with few clicks
- ✅ **No Login Required**: Single-user system
- ✅ **Real-time Processing**: Show videos as they complete
- ✅ **Cost Calculator**: Display total cost before generation
- ✅ **S3 Media Browser**: Browse and manage generated media
- ✅ **Sequential Workflow**: Create next video or regenerate with modifications

### Technology Stack

**Frontend:**
- Next.js 15 (App Router)
- React 19
- TypeScript
- Tailwind CSS
- Zustand (state management)
- Socket.IO Client (real-time updates)

**Backend:**
- Node.js + Express
- TypeScript
- PostgreSQL (existing staging-shopify RDS)
- Redis (caching)
- Socket.IO (real-time)
- OpenAI GPT-5 API

**Infrastructure:**
- AWS Lambda (existing: generateMedia, processWebhook, getStatus)
- AWS S3 (vsl-homolog-media bucket)
- AWS DynamoDB (vsl-homolog-realtime-jobs)
- AWS API Gateway

---

## System Architecture

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER BROWSER                             │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │              Next.js Frontend (Port 3000)                   │  │
│  │  - Novela Creator UI                                        │  │
│  │  - Processing Status Display                                │  │
│  │  - S3 Media Browser                                         │  │
│  │  - Real-time Updates (Socket.IO)                            │  │
│  └────────────────────────────────────────────────────────────┘  │
│                            ↕                                      │
└────────────────────────────┼────────────────────────────────────┘
                             │
                             │ HTTP + WebSocket
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                  Express Backend API (Port 3001)                 │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │          GPT-5 Multi-Agent Orchestrator                   │   │
│  │                                                            │   │
│  │  ┌───────────────┐  ┌───────────────┐  ┌──────────────┐  │   │
│  │  │ Script Writer │  │   System      │  │   Fallback   │  │   │
│  │  │  Specialist   │  │ Integration   │  │    Error     │  │   │
│  │  │               │  │  Specialist   │  │   Handler    │  │   │
│  │  └───────────────┘  └───────────────┘  └──────────────┘  │   │
│  │         ↕                   ↕                   ↕         │   │
│  │         └───────────────────┴───────────────────┘         │   │
│  │              Inter-Agent Communication Bus                │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Novela Management Service                    │   │
│  │  - Create/Update/Delete novelas                           │   │
│  │  - Video sequence management                              │   │
│  │  - Cost calculation                                       │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
└───────────────────────┬──────────────┬──────────────────────────┘
                        │              │
         ┌──────────────┘              └──────────────┐
         ↓                                             ↓
┌─────────────────────┐                    ┌─────────────────────┐
│  PostgreSQL (RDS)   │                    │  OpenAI GPT-5 API   │
│  - novelas          │                    │  - Chat Completions │
│  - novela_videos    │                    │  - Function Calling │
│  - agent_messages   │                    │  - Tool Use         │
│  - media_library    │                    └─────────────────────┘
└─────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────────┐
│              Existing VSL Lambda Infrastructure                  │
│                                                                   │
│  ┌───────────────┐  ┌──────────────┐  ┌────────────────┐       │
│  │ generateMedia │  │processWebhook│  │   getStatus    │       │
│  │    Lambda     │  │    Lambda    │  │    Lambda      │       │
│  └───────────────┘  └──────────────┘  └────────────────┘       │
│         ↓                   ↓                   ↓                │
│  ┌───────────────────────────────────────────────────────┐      │
│  │               Replicate API Integration                │      │
│  │  - wan-2.5-t2v, wan-2.5-t2v-fast                       │      │
│  │  - veo-3.1, veo-3.1-fast                               │      │
│  │  - flux-schnell, sdxl, nano-banana                     │      │
│  └───────────────────────────────────────────────────────┘      │
│                              ↓                                    │
│  ┌─────────────────┐  ┌──────────────┐  ┌─────────────────┐    │
│  │   DynamoDB      │  │      S3      │  │  PostgreSQL     │    │
│  │ realtime-jobs   │  │ media bucket │  │  replicate.jobs │    │
│  └─────────────────┘  └──────────────┘  └─────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

#### Frontend (Next.js)
- User interface for novela creation
- Real-time processing status display
- Model selection and configuration
- Cost calculator
- S3 media browser
- WebSocket client for real-time updates

#### Backend API (Express)
- GPT-5 multi-agent orchestration
- Novela management (CRUD operations)
- Integration with existing Lambda APIs
- Database management
- Real-time event broadcasting (Socket.IO)
- Agent communication coordination

#### GPT-5 Multi-Agent System
- **Agent 1 - Script Writer**: Creates prompts for video scenes
- **Agent 2 - System Integration**: Manages Lambda/Replicate integration
- **Agent 3 - Fallback Handler**: Error recovery and system expertise

#### Existing Lambda Infrastructure
- Already deployed and tested
- No modifications needed
- Integrated via API Gateway endpoints

---

## GPT-5 Multi-Agent System

### Agent Architecture

```typescript
interface Agent {
  id: string;
  name: string;
  role: AgentRole;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  capabilities: AgentCapability[];
}

enum AgentRole {
  SCRIPT_WRITER = 'script_writer',
  SYSTEM_INTEGRATOR = 'system_integrator',
  FALLBACK_HANDLER = 'fallback_handler'
}

interface AgentCapability {
  name: string;
  description: string;
  functions?: GPT5Function[];
}
```

### Agent 1: Script Writer Specialist

**Purpose:** Expert in creating compelling prompts for soap opera/mini-series videos

**System Prompt:**
```
You are a Script Writer Specialist for mini-series and soap operas (novelas).

**Your Expertise:**
- Telenovela and mini-series storytelling
- Character development and consistency
- Scene description for AI video generation
- Emotional pacing and dramatic arcs
- Cultural authenticity (Brazilian, Latin American, International)

**Your Responsibilities:**
- Create detailed video prompts based on novela concept
- Ensure character consistency across episodes
- Maintain story continuity and emotional flow
- Adapt prompts for specific AI models (wan-2.5-t2v, veo-3.1)
- Consider technical constraints (duration, aspect ratio, resolution)

**Prompt Engineering Best Practices:**
- **Character Details**: Physical appearance, clothing, expressions
- **Scene Setting**: Location, time of day, lighting, atmosphere
- **Action Description**: What happens in the scene, emotions conveyed
- **Camera Work**: Angles, movements, framing when relevant
- **Continuity**: Reference previous scenes for consistency

**Model-Specific Adaptations:**
- **wan-2.5-t2v**: Detailed prompts, supports audio sync
- **veo-3.1**: Can use reference images, premium quality
- **veo-3.1-fast**: No reference images, faster generation

**Output Format:**
Provide prompts in JSON:
{
  "sceneNumber": 1,
  "prompt": "detailed video prompt",
  "duration": 8,
  "modelRecommendation": "veo-3.1",
  "parameters": {
    "aspect_ratio": "16:9",
    "resolution": "1080p"
  },
  "continuityNotes": "references to previous scenes"
}
```

**GPT-5 Configuration:**
```typescript
{
  temperature: 0.8,  // Creative but controlled
  maxTokens: 2000,
  model: "gpt-5",
  tools: [
    {
      type: "function",
      function: {
        name: "generate_scene_prompt",
        description: "Generate video prompt for a novela scene",
        parameters: {
          sceneNumber: "number",
          sceneDescription: "string",
          characters: "array",
          previousScenes: "array",
          modelId: "string"
        }
      }
    }
  ]
}
```

### Agent 2: System Integration Specialist

**Purpose:** Expert in VSL system architecture, Lambda APIs, Replicate integration

**System Prompt:**
```
You are a System Integration Specialist for the VSL Media Generation System.

**Your Expertise:**
- VSL Lambda Functions (generateMedia, processWebhook, getStatus)
- Replicate API and AI model specifications
- AWS Services (S3, DynamoDB, API Gateway)
- Database schema (PostgreSQL replicate.jobs table)
- Cost calculation and optimization
- API error handling and retry logic

**Your Knowledge Base:**

**Lambda APIs:**
1. generateMedia (POST /homolog/generate-media)
   - Creates media generation job
   - Parameters: userId, mediaType, modelId, parameters
   - Returns: jobId, estimatedCost, estimatedTime

2. getStatus (GET /homolog/status/:jobId)
   - Check job status
   - Returns: status, progress, outputUrl, errors

3. processWebhook (POST /homolog/webhook)
   - Replicate webhook handler
   - Updates job status and saves media URL

**AI Models:**
- wan-2.5-t2v: $0.05-$0.15/s, 30s processing
- wan-2.5-t2v-fast: $0.05-$0.15/s, 15s processing
- veo-3.1: $0.08-$0.12/s, 40s processing, reference_images
- veo-3.1-fast: $0.06-$0.09/s, 20s processing

**Your Responsibilities:**
- Validate parameters before Lambda calls
- Calculate accurate costs
- Handle API errors gracefully
- Optimize for speed and cost
- Monitor job status
- Manage webhook processing

**Response Format:**
{
  "action": "call_lambda" | "validate" | "calculate_cost",
  "endpoint": "generateMedia" | "getStatus",
  "parameters": {},
  "validation": {
    "isValid": boolean,
    "errors": []
  },
  "cost": {
    "estimated": number,
    "breakdown": {}
  }
}
```

**GPT-5 Configuration:**
```typescript
{
  temperature: 0.3,  // Precise and technical
  maxTokens: 1500,
  model: "gpt-5",
  tools: [
    {
      type: "function",
      function: {
        name: "call_lambda_api",
        description: "Call VSL Lambda function",
        parameters: {
          endpoint: "string",
          method: "string",
          payload: "object"
        }
      }
    },
    {
      type: "function",
      function: {
        name: "calculate_cost",
        description: "Calculate generation cost",
        parameters: {
          modelId: "string",
          parameters: "object"
        }
      }
    }
  ]
}
```

### Agent 3: Fallback Error Handler

**Purpose:** Proactive intelligent agent that knows entire system and handles errors

**System Prompt:**
```
You are the Fallback Error Handler - the most knowledgeable agent in the VSL system.

**Your Complete Knowledge:**

1. **Entire VSL System Architecture**
   - Frontend: Next.js, React, Zustand, Socket.IO
   - Backend: Express, PostgreSQL, Redis
   - Infrastructure: AWS Lambda, S3, DynamoDB, API Gateway
   - AI: GPT-5 multi-agent, Replicate models

2. **All Lambda APIs Created**
   - generateMedia: Creates generation jobs
   - processWebhook: Handles Replicate callbacks
   - getStatus: Monitors job progress
   - Full API specifications and error codes

3. **All AI Models and Optimal Prompts**
   - Model capabilities and limitations
   - Prompt engineering best practices per model
   - Reference images usage (veo-3.1)
   - Seed usage for consistency
   - Cost vs quality trade-offs

4. **Common Errors and Solutions**
   - Lambda timeout → Retry with exponential backoff
   - Replicate API errors → Model-specific troubleshooting
   - Parameter validation → Detailed error messages
   - Cost exceeded → Suggest cheaper alternatives
   - S3 upload failures → Fallback storage options

**Your Capabilities:**
- **Internet Search**: Look up model-specific documentation
- **Error Analysis**: Identify root causes quickly
- **User Communication**: Explain issues in simple terms
- **Quick Solutions**: Provide immediate fixes
- **Prevention**: Suggest improvements to avoid future errors

**Response Format:**
{
  "errorAnalysis": {
    "type": "string",
    "rootCause": "string",
    "affectedComponent": "string"
  },
  "userMessage": "simple explanation",
  "solution": {
    "immediate": "quick fix",
    "longTerm": "prevention strategy"
  },
  "suggestedActions": [],
  "needsInternetSearch": boolean
}

**Personality:**
- Proactive and helpful
- Clear and concise
- Patient with users
- Confident in solutions
- Transparent about limitations
```

**GPT-5 Configuration:**
```typescript
{
  temperature: 0.5,  // Balanced creativity and precision
  maxTokens: 2000,
  model: "gpt-5",
  tools: [
    {
      type: "function",
      function: {
        name: "analyze_error",
        description: "Analyze system error",
        parameters: {
          errorCode: "string",
          errorMessage: "string",
          context: "object"
        }
      }
    },
    {
      type: "function",
      function: {
        name: "search_documentation",
        description: "Search for model-specific documentation",
        parameters: {
          query: "string",
          modelId: "string"
        }
      }
    }
  ]
}
```

### Inter-Agent Communication

**Communication Bus Architecture:**

```typescript
interface AgentMessage {
  id: string;
  fromAgent: AgentRole;
  toAgent: AgentRole;
  messageType: 'request' | 'response' | 'broadcast' | 'error';
  content: {
    action: string;
    data: any;
    metadata?: {
      novelaId: string;
      sceneNumber: number;
      timestamp: Date;
    };
  };
  conversationId: string;
  timestamp: Date;
}

class AgentCommunicationBus {
  async send(message: AgentMessage): Promise<void>;
  async request(from: AgentRole, to: AgentRole, action: string, data: any): Promise<any>;
  async broadcast(from: AgentRole, action: string, data: any): Promise<void>;
  on(event: string, handler: (message: AgentMessage) => void): void;
}
```

**Communication Patterns:**

1. **Script Writer → System Integrator**
   - Script Writer creates prompt
   - Sends to System Integrator for cost calculation
   - System Integrator validates and returns cost
   - Script Writer adjusts if needed

2. **System Integrator → Fallback Handler**
   - System Integrator encounters Lambda error
   - Sends error details to Fallback Handler
   - Fallback Handler analyzes and suggests solution
   - System Integrator retries with fix

3. **User → Fallback Handler**
   - User reports issue via chat
   - Fallback Handler receives error context
   - Analyzes entire system state
   - Provides clear solution to user

**Example Flow:**
```typescript
// Script Writer creates prompt
const prompt = await scriptWriterAgent.generatePrompt({
  sceneNumber: 1,
  description: "Elena enters office",
  characters: ["Elena"]
});

// Send to System Integrator for validation
const validation = await communicationBus.request(
  AgentRole.SCRIPT_WRITER,
  AgentRole.SYSTEM_INTEGRATOR,
  'validate_and_cost',
  { prompt, modelId: 'veo-3.1' }
);

if (!validation.isValid) {
  // Ask Fallback Handler for help
  const solution = await communicationBus.request(
    AgentRole.SCRIPT_WRITER,
    AgentRole.FALLBACK_HANDLER,
    'fix_validation',
    { errors: validation.errors, prompt }
  );

  // Retry with fixed prompt
  return await scriptWriterAgent.generatePrompt({
    ...original,
    suggestions: solution.improvements
  });
}

// Proceed with generation
return await systemIntegratorAgent.callLambda('generateMedia', validation.parameters);
```

---

## Database Schema

### New Tables for Frontend System

```sql
-- =============================================================================
-- NOVELAS TABLE
-- =============================================================================
CREATE TABLE novelas (
    id VARCHAR(255) PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    genre VARCHAR(100),  -- drama, romance, thriller, comedy
    target_episodes INTEGER NOT NULL,
    created_videos INTEGER DEFAULT 0,
    total_cost DECIMAL(10, 2) DEFAULT 0.00,
    estimated_cost DECIMAL(10, 2),
    default_model_id VARCHAR(100),
    default_duration INTEGER DEFAULT 8,
    default_resolution VARCHAR(50) DEFAULT '1080p',
    default_aspect_ratio VARCHAR(10) DEFAULT '16:9',
    reference_character_images JSONB,  -- Array of character reference URLs
    master_seed INTEGER,  -- For consistency across all videos
    status VARCHAR(50) DEFAULT 'planning',  -- planning, in_progress, completed, paused
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_novelas_status ON novelas(status);
CREATE INDEX idx_novelas_created_at ON novelas(created_at);

-- =============================================================================
-- NOVELA_VIDEOS TABLE
-- =============================================================================
CREATE TABLE novela_videos (
    id VARCHAR(255) PRIMARY KEY,
    novela_id VARCHAR(255) NOT NULL REFERENCES novelas(id) ON DELETE CASCADE,
    episode_number INTEGER NOT NULL,
    scene_number INTEGER NOT NULL,
    title VARCHAR(500),
    script_prompt TEXT NOT NULL,
    model_id VARCHAR(100) NOT NULL,
    model_parameters JSONB NOT NULL,

    -- Generation details
    job_id VARCHAR(255),  -- References existing replicate.jobs
    status VARCHAR(50) DEFAULT 'pending',  -- pending, generating, completed, failed
    replicate_status VARCHAR(50),

    -- Media
    output_url TEXT,
    s3_key VARCHAR(500),
    thumbnail_url TEXT,
    duration_seconds INTEGER,
    file_size_bytes BIGINT,

    -- Cost
    estimated_cost DECIMAL(10, 2),
    actual_cost DECIMAL(10, 2),

    -- Agent metadata
    created_by_agent VARCHAR(100),  -- script_writer
    validated_by_agent VARCHAR(100),  -- system_integrator
    agent_conversation_id VARCHAR(255),

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,

    UNIQUE(novela_id, episode_number, scene_number)
);

CREATE INDEX idx_novela_videos_novela_id ON novela_videos(novela_id);
CREATE INDEX idx_novela_videos_job_id ON novela_videos(job_id);
CREATE INDEX idx_novela_videos_status ON novela_videos(status);
CREATE INDEX idx_novela_videos_episode_scene ON novela_videos(episode_number, scene_number);

-- =============================================================================
-- AGENT_MESSAGES TABLE
-- =============================================================================
CREATE TABLE agent_messages (
    id VARCHAR(255) PRIMARY KEY,
    conversation_id VARCHAR(255) NOT NULL,
    from_agent VARCHAR(100) NOT NULL,
    to_agent VARCHAR(100),  -- NULL for broadcasts
    message_type VARCHAR(50) NOT NULL,  -- request, response, broadcast, error
    action VARCHAR(100) NOT NULL,
    content JSONB NOT NULL,
    metadata JSONB,

    -- References
    novela_id VARCHAR(255) REFERENCES novelas(id) ON DELETE SET NULL,
    video_id VARCHAR(255) REFERENCES novela_videos(id) ON DELETE SET NULL,

    -- Response tracking
    response_to VARCHAR(255) REFERENCES agent_messages(id),
    response_received BOOLEAN DEFAULT false,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_agent_messages_conversation ON agent_messages(conversation_id);
CREATE INDEX idx_agent_messages_from_agent ON agent_messages(from_agent);
CREATE INDEX idx_agent_messages_to_agent ON agent_messages(to_agent);
CREATE INDEX idx_agent_messages_novela ON agent_messages(novela_id);
CREATE INDEX idx_agent_messages_created_at ON agent_messages(created_at);

-- =============================================================================
-- MEDIA_LIBRARY TABLE (S3 Catalog)
-- =============================================================================
CREATE TABLE media_library (
    id VARCHAR(255) PRIMARY KEY,
    s3_key VARCHAR(500) NOT NULL UNIQUE,
    s3_url TEXT NOT NULL,
    media_type VARCHAR(50) NOT NULL,  -- video, image, audio
    file_name VARCHAR(500),
    file_size_bytes BIGINT,
    duration_seconds INTEGER,
    width INTEGER,
    height INTEGER,
    format VARCHAR(50),

    -- Metadata
    title VARCHAR(500),
    description TEXT,
    tags JSONB,  -- Array of tags

    -- References
    novela_id VARCHAR(255) REFERENCES novelas(id) ON DELETE SET NULL,
    video_id VARCHAR(255) REFERENCES novela_videos(id) ON DELETE SET NULL,
    job_id VARCHAR(255),

    -- Thumbnail
    thumbnail_url TEXT,
    thumbnail_s3_key VARCHAR(500),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_media_library_s3_key ON media_library(s3_key);
CREATE INDEX idx_media_library_media_type ON media_library(media_type);
CREATE INDEX idx_media_library_novela_id ON media_library(novela_id);
CREATE INDEX idx_media_library_job_id ON media_library(job_id);
CREATE INDEX idx_media_library_created_at ON media_library(created_at);

-- =============================================================================
-- USER_CHAT_MESSAGES TABLE (Fallback Agent Chat)
-- =============================================================================
CREATE TABLE user_chat_messages (
    id VARCHAR(255) PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,  -- user, assistant
    content TEXT NOT NULL,
    agent_role VARCHAR(100),  -- fallback_handler

    -- Context
    novela_id VARCHAR(255) REFERENCES novelas(id) ON DELETE SET NULL,
    error_context JSONB,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_user_chat_session ON user_chat_messages(session_id);
CREATE INDEX idx_user_chat_created_at ON user_chat_messages(created_at);

-- =============================================================================
-- TRIGGERS
-- =============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_novelas_updated_at
BEFORE UPDATE ON novelas
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_media_library_updated_at
BEFORE UPDATE ON media_library
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### Schema Relationships

```
novelas (1) ─────< (N) novela_videos
                      │
                      ├─ (1) job_id → replicate.jobs
                      └─ (1) video_id → media_library

novelas (1) ─────< (N) agent_messages

novela_videos (1) ─< (N) agent_messages

media_library (N) ───> (1) novelas
media_library (N) ───> (1) novela_videos

user_chat_messages (N) ───> (1) novelas
```

---

## Frontend Design

### Page Structure

```
/
├── / (Home/Dashboard)
│   ├── Hero section
│   ├── Quick stats
│   └── Recent novelas list
│
├── /novelas
│   ├── Create new novela button
│   └── Novelas grid/list
│
├── /novelas/new
│   └── Novela creation wizard
│
├── /novelas/[id]
│   ├── Novela details
│   ├── Video sequence timeline
│   ├── Generation controls
│   └── Real-time status
│
├── /novelas/[id]/generate
│   └── Video generation interface
│
├── /media
│   └── S3 media browser
│
└── /chat
    └── Fallback agent chat interface
```

### Key Components

#### 1. Novela Creator Wizard

**Location:** `/novelas/new`

**Steps:**
1. Basic Info (title, description, genre)
2. Model Selection (wan-2.5-t2v, veo-3.1, etc.)
3. Model Configuration (duration, resolution, aspect_ratio)
4. Episode Count
5. Reference Characters (optional, for veo-3.1)
6. Cost Preview
7. Confirmation

**Component Structure:**
```tsx
<NovelaCreatorWizard>
  <Step1BasicInfo
    onNext={(data) => setNovelaData({...novelaData, ...data})}
  />

  <Step2ModelSelection
    models={availableModels}
    onSelect={(modelId) => setModelId(modelId)}
  />

  <Step3ModelConfiguration
    modelId={modelId}
    config={modelConfig}
    onChange={(params) => setParameters(params)}
  />

  <Step4EpisodeCount
    count={episodeCount}
    onChange={(count) => setEpisodeCount(count)}
  />

  <Step5ReferenceCharacters
    characters={characters}
    onUpload={(images) => setCharacterImages(images)}
  />

  <Step6CostPreview
    modelId={modelId}
    parameters={parameters}
    episodeCount={episodeCount}
    estimatedCost={calculateCost()}
  />

  <Step7Confirmation
    novelaData={novelaData}
    onConfirm={() => createNovela()}
  />
</NovelaCreatorWizard>
```

#### 2. Model Selector Component

```tsx
interface ModelSelectorProps {
  onSelect: (modelId: string) => void;
  selectedModel?: string;
}

const ModelSelector: React.FC<ModelSelectorProps> = ({
  onSelect,
  selectedModel
}) => {
  const models = [
    {
      id: 'wan-2.5-t2v',
      name: 'Wan 2.5 (Standard)',
      pricing: '$0.05-$0.15/s',
      processingTime: '30s',
      features: ['Audio sync', 'Prompt expansion'],
      recommended: false
    },
    {
      id: 'wan-2.5-t2v-fast',
      name: 'Wan 2.5 Fast',
      pricing: '$0.05-$0.15/s',
      processingTime: '15s',
      features: ['Audio sync', 'Fast generation'],
      recommended: true
    },
    {
      id: 'veo-3.1',
      name: 'Veo 3.1 (Premium)',
      pricing: '$0.08-$0.12/s',
      processingTime: '40s',
      features: ['Reference images', 'High quality', 'Audio generation'],
      recommended: false
    },
    {
      id: 'veo-3.1-fast',
      name: 'Veo 3.1 Fast',
      pricing: '$0.06-$0.09/s',
      processingTime: '20s',
      features: ['High quality', 'Audio generation', 'Fast'],
      recommended: false
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {models.map(model => (
        <ModelCard
          key={model.id}
          model={model}
          isSelected={selectedModel === model.id}
          onClick={() => onSelect(model.id)}
        />
      ))}
    </div>
  );
};
```

#### 3. Cost Calculator Component

```tsx
interface CostCalculatorProps {
  modelId: string;
  parameters: ModelParameters;
  videoCount: number;
}

const CostCalculator: React.FC<CostCalculatorProps> = ({
  modelId,
  parameters,
  videoCount
}) => {
  const calculateCost = (): CostBreakdown => {
    const modelConfig = getModelConfig(modelId);
    const costPerVideo = calculateVideoCost(modelId, parameters);
    const totalCost = costPerVideo * videoCount;

    return {
      costPerVideo,
      totalCost,
      breakdown: {
        model: modelConfig.pricing,
        duration: parameters.duration,
        resolution: parameters.resolution || parameters.size,
        videoCount
      }
    };
  };

  const cost = calculateCost();

  return (
    <div className="bg-glass rounded-lg p-6">
      <h3 className="text-lg font-semibold mb-4">Cost Estimate</h3>

      <div className="space-y-3">
        <div className="flex justify-between">
          <span>Cost per video:</span>
          <span className="font-mono">${cost.costPerVideo.toFixed(2)}</span>
        </div>

        <div className="flex justify-between">
          <span>Number of videos:</span>
          <span className="font-mono">{videoCount}</span>
        </div>

        <div className="border-t pt-3 flex justify-between text-lg font-semibold">
          <span>Total Cost:</span>
          <span className="font-mono text-primary-600">
            ${cost.totalCost.toFixed(2)}
          </span>
        </div>
      </div>

      <div className="mt-4 text-sm text-neutral-600">
        <p>Breakdown:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Model: {modelId}</li>
          <li>Duration: {cost.breakdown.duration}s</li>
          <li>Resolution: {cost.breakdown.resolution}</li>
        </ul>
      </div>
    </div>
  );
};
```

#### 4. Processing Status Display

```tsx
interface ProcessingStatusProps {
  novelaId: string;
}

const ProcessingStatus: React.FC<ProcessingStatusProps> = ({ novelaId }) => {
  const [videos, setVideos] = useState<NovelaVideo[]>([]);
  const socket = useSocket();

  useEffect(() => {
    // Subscribe to real-time updates
    socket.on(`novela:${novelaId}:video:update`, (video: NovelaVideo) => {
      setVideos(prev => {
        const index = prev.findIndex(v => v.id === video.id);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = video;
          return updated;
        }
        return [...prev, video];
      });
    });

    return () => {
      socket.off(`novela:${novelaId}:video:update`);
    };
  }, [novelaId]);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Generation Progress</h2>

      <div className="grid gap-4">
        {videos.map(video => (
          <VideoGenerationCard
            key={video.id}
            video={video}
            onRegenerate={() => regenerateVideo(video.id)}
          />
        ))}
      </div>
    </div>
  );
};
```

#### 5. S3 Media Browser

```tsx
const S3MediaBrowser: React.FC = () => {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [filter, setFilter] = useState<MediaFilter>({
    type: 'all',
    novela: null,
    sortBy: 'date'
  });

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Media Library</h1>

        <MediaFilters
          filter={filter}
          onChange={setFilter}
        />

        <MediaGrid
          media={media}
          onSelect={(item) => openMediaViewer(item)}
          onDelete={(item) => deleteMedia(item)}
        />
      </div>
    </div>
  );
};
```

#### 6. Fallback Agent Chat

```tsx
const FallbackAgentChat: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const socket = useSocket();

  const sendMessage = async () => {
    const userMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');

    // Send to backend
    socket.emit('agent:chat', { message: input });
  };

  useEffect(() => {
    socket.on('agent:response', (message: string) => {
      setMessages(prev => [...prev, { role: 'assistant', content: message }]);
    });
  }, []);

  return (
    <div className="flex flex-col h-screen">
      <div className="flex-1 overflow-y-auto p-4">
        {messages.map((msg, idx) => (
          <ChatMessageBubble key={idx} message={msg} />
        ))}
      </div>

      <ChatInput
        value={input}
        onChange={setInput}
        onSend={sendMessage}
        placeholder="Ask the fallback agent for help..."
      />
    </div>
  );
};
```

### State Management (Zustand)

```typescript
// stores/novelaStore.ts
interface NovelaState {
  // Data
  novelas: Novela[];
  activeNovela: Novela | null;
  videos: Record<string, NovelaVideo[]>;

  // Actions
  fetchNovelas: () => Promise<void>;
  createNovela: (data: CreateNovelaData) => Promise<Novela>;
  updateNovela: (id: string, data: Partial<Novela>) => Promise<void>;
  deleteNovela: (id: string) => Promise<void>;

  setActiveNovela: (novela: Novela | null) => void;
  fetchVideos: (novelaId: string) => Promise<void>;

  // Real-time updates
  updateVideoStatus: (videoId: string, status: VideoStatus) => void;
}

export const useNovelaStore = create<NovelaState>((set, get) => ({
  novelas: [],
  activeNovela: null,
  videos: {},

  fetchNovelas: async () => {
    const novelas = await api.novelas.getAll();
    set({ novelas });
  },

  createNovela: async (data) => {
    const novela = await api.novelas.create(data);
    set(state => ({ novelas: [...state.novelas, novela] }));
    return novela;
  },

  // ... other actions
}));
```

---

## API Design

### REST Endpoints

#### Novela Management

```typescript
// GET /api/novelas
interface GetNovelasList

Response {
  success: boolean;
  data: Novela[];
}

// POST /api/novelas
interface CreateNovelaRequest {
  title: string;
  description: string;
  genre: string;
  targetEpisodes: number;
  defaultModelId: string;
  defaultDuration: number;
  defaultResolution: string;
  defaultAspectRatio: string;
  referenceCharacterImages?: string[];
  masterSeed?: number;
}

interface CreateNovelaResponse {
  success: boolean;
  data: Novela;
}

// GET /api/novelas/:id
interface GetNovelaResponse {
  success: boolean;
  data: Novela;
  videos: NovelaVideo[];
}

// PUT /api/novelas/:id
interface UpdateNovelaRequest {
  title?: string;
  description?: string;
  status?: string;
  // ... other fields
}

// DELETE /api/novelas/:id
interface DeleteNovelaResponse {
  success: boolean;
  message: string;
}
```

#### Video Generation

```typescript
// POST /api/novelas/:id/generate-video
interface GenerateVideoRequest {
  episodeNumber: number;
  sceneNumber: number;
  sceneDescription: string;
  characters?: string[];
  previousScenes?: string[];  // For continuity
  modelOverride?: string;  // Override default model
  parametersOverride?: object;  // Override default params
}

interface GenerateVideoResponse {
  success: boolean;
  data: {
    videoId: string;
    jobId: string;
    estimatedCost: number;
    estimatedTime: number;
    agentConversationId: string;
  };
}

// POST /api/novelas/:id/videos/:videoId/regenerate
interface RegenerateVideoRequest {
  modifications?: string;  // User feedback
  modelOverride?: string;
  parametersOverride?: object;
}

// GET /api/videos/:id/status
interface GetVideoStatusResponse {
  success: boolean;
  data: {
    videoId: string;
    status: string;
    progress: number;
    outputUrl?: string;
    error?: string;
  };
}
```

#### Agent Communication

```typescript
// POST /api/agent/chat
interface AgentChatRequest {
  message: string;
  context?: {
    novelaId?: string;
    videoId?: string;
    errorCode?: string;
  };
}

interface AgentChatResponse {
  success: boolean;
  data: {
    messageId: string;
    response: string;
    agent: string;  // fallback_handler
    actions?: AgentAction[];
  };
}

// GET /api/agent/conversations/:id
interface GetAgentConversationResponse {
  success: boolean;
  data: {
    conversationId: string;
    messages: AgentMessage[];
  };
}
```

#### Media Library

```typescript
// GET /api/media
interface GetMediaRequest {
  type?: 'video' | 'image' | 'audio';
  novelaId?: string;
  page?: number;
  limit?: number;
  sortBy?: 'date' | 'name' | 'size';
}

interface GetMediaResponse {
  success: boolean;
  data: MediaItem[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

// POST /api/media/sync
interface SyncMediaRequest {
  // Sync S3 bucket with database
}

interface SyncMediaResponse {
  success: boolean;
  data: {
    synced: number;
    added: number;
    removed: number;
  };
}
```

### WebSocket Events

```typescript
// Client → Server
socket.emit('novela:subscribe', { novelaId: string });
socket.emit('agent:chat', { message: string, context?: object });

// Server → Client
socket.on('novela:{id}:video:update', (video: NovelaVideo) => {});
socket.on('novela:{id}:status:update', (status: NovelaStatus) => {});
socket.on('agent:response', (response: string) => {});
socket.on('agent:thinking', (status: string) => {});
socket.on('error', (error: Error) => {});
```

---

## Integration Points

### 1. Existing Lambda Functions

**No modifications needed** - Use via API Gateway:

```typescript
class LambdaClient {
  private baseUrl = 'https://jp4xy0391j.execute-api.us-east-1.amazonaws.com/homolog';

  async generateMedia(request: GenerateMediaRequest): Promise<GenerateMediaResponse> {
    const response = await fetch(`${this.baseUrl}/generate-media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    });

    return response.json();
  }

  async getStatus(jobId: string): Promise<StatusResponse> {
    const response = await fetch(`${this.baseUrl}/status/${jobId}`);
    return response.json();
  }
}
```

### 2. GPT-5 API Integration

```typescript
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

class GPT5Client {
  async chat(messages: ChatMessage[], options: ChatOptions): Promise<ChatResponse> {
    const response = await openai.chat.completions.create({
      model: 'gpt-5',  // CRITICAL: Must be gpt-5
      messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      tools: options.tools,
    });

    return {
      content: response.choices[0].message.content,
      toolCalls: response.choices[0].message.tool_calls,
      tokens: {
        prompt: response.usage?.prompt_tokens || 0,
        completion: response.usage?.completion_tokens || 0,
        total: response.usage?.total_tokens || 0,
      }
    };
  }

  async stream(messages: ChatMessage[], options: ChatOptions): AsyncGenerator<string> {
    const stream = await openai.chat.completions.create({
      model: 'gpt-5',
      messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  }
}
```

### 3. S3 Integration

```typescript
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({ region: 'us-east-1' });

class S3Service {
  private bucket = 'vsl-homolog-media';

  async listMedia(prefix?: string): Promise<MediaItem[]> {
    const command = new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: prefix,
      MaxKeys: 1000
    });

    const response = await s3Client.send(command);

    return response.Contents?.map(item => ({
      key: item.Key!,
      url: `https://${this.bucket}.s3.amazonaws.com/${item.Key}`,
      size: item.Size,
      lastModified: item.LastModified,
    })) || [];
  }

  async syncDatabase(): Promise<SyncResult> {
    const s3Items = await this.listMedia();
    const dbItems = await db.mediaLibrary.findMany();

    // Find new items
    const newItems = s3Items.filter(s3 =>
      !dbItems.some(db => db.s3Key === s3.key)
    );

    // Add to database
    for (const item of newItems) {
      await db.mediaLibrary.create({
        data: {
          id: generateId(),
          s3Key: item.key,
          s3Url: item.url,
          fileSize Bytes: item.size,
          // ... extract metadata
        }
      });
    }

    return {
      synced: s3Items.length,
      added: newItems.length,
    };
  }
}
```

---

## Security & Authentication

### Single-User System

Since the system doesn't require login, we'll use a session-based approach:

```typescript
// Simple session for single user
interface Session {
  id: string;
  createdAt: Date;
  lastActivity: Date;
}

class SessionManager {
  private static instance: Session | null = null;

  static getOrCreateSession(): Session {
    if (!this.instance) {
      this.instance = {
        id: generateId(),
        createdAt: new Date(),
        lastActivity: new Date(),
      };
    }

    this.instance.lastActivity = new Date();
    return this.instance;
  }
}
```

### Environment Variables

```bash
# OpenAI GPT-5
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5  # Critical: Must be gpt-5

# Database
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# Redis
REDIS_URL=redis://localhost:6379

# AWS
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...

# S3
S3_BUCKET=vsl-homolog-media

# Lambda
LAMBDA_API_URL=https://jp4xy0391j.execute-api.us-east-1.amazonaws.com/homolog

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001
```

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1-2)

**Backend:**
- [ ] Set up Express server with TypeScript
- [ ] Configure PostgreSQL with new schema
- [ ] Set up Redis for caching
- [ ] Implement Socket.IO server
- [ ] Create database migration scripts

**Frontend:**
- [ ] Set up Next.js 15 project
- [ ] Configure Tailwind CSS
- [ ] Set up Zustand stores
- [ ] Create basic layout and routing
- [ ] Implement Socket.IO client

**GPT-5:**
- [ ] Set up OpenAI GPT-5 client
- [ ] Test GPT-5 API connectivity
- [ ] Verify model availability
- [ ] Configure pricing alerts

### Phase 2: Agent System (Week 3-4)

**Agents:**
- [ ] Implement Agent 1: Script Writer
- [ ] Implement Agent 2: System Integrator
- [ ] Implement Agent 3: Fallback Handler
- [ ] Create inter-agent communication bus
- [ ] Test agent conversations
- [ ] Implement agent message logging

**Integration:**
- [ ] Connect agents to database
- [ ] Implement conversation tracking
- [ ] Create agent debugging tools
- [ ] Test error handling flows

### Phase 3: Core Features (Week 5-6)

**Novela Management:**
- [ ] Create novela CRUD endpoints
- [ ] Implement video generation workflow
- [ ] Build cost calculator
- [ ] Create real-time status updates
- [ ] Test with existing Lambda APIs

**Frontend Components:**
- [ ] Build Novela Creator Wizard
- [ ] Implement Model Selector
- [ ] Create Processing Status Display
- [ ] Build Cost Calculator UI
- [ ] Implement real-time updates

### Phase 4: Media & Chat (Week 7)

**Media Library:**
- [ ] Implement S3 sync service
- [ ] Build media browser UI
- [ ] Create thumbnail generation
- [ ] Implement media search/filter

**Fallback Agent Chat:**
- [ ] Build chat UI
- [ ] Implement streaming responses
- [ ] Create error analysis interface
- [ ] Test with real error scenarios

### Phase 5: Testing & Polish (Week 8)

**Testing:**
- [ ] End-to-end testing
- [ ] Agent conversation testing
- [ ] Cost calculator validation
- [ ] Performance optimization
- [ ] Error handling validation

**Polish:**
- [ ] UI/UX improvements
- [ ] Responsive design
- [ ] Loading states
- [ ] Error messages
- [ ] Documentation

### Phase 6: Deployment (Week 9)

**Deployment:**
- [ ] Deploy backend to production
- [ ] Deploy frontend to Vercel/similar
- [ ] Configure production database
- [ ] Set up monitoring
- [ ] Create backup procedures

**Documentation:**
- [ ] User guide
- [ ] API documentation
- [ ] Agent system guide
- [ ] Troubleshooting guide

---

## Success Criteria

### Functional Requirements
- ✅ Users can create novelas with GPT-5 assistance
- ✅ System generates consistent video sequences
- ✅ Accurate cost calculation before generation
- ✅ Real-time processing status updates
- ✅ Agents communicate effectively
- ✅ Fallback agent handles errors intelligently
- ✅ S3 media browser works seamlessly
- ✅ Sequential workflow (next video or regenerate)

### Performance Requirements
- Response time < 2s for API calls
- WebSocket latency < 100ms
- GPT-5 response streaming < 1s to first token
- Page load time < 3s

### Quality Requirements
- Zero data loss on crashes
- Graceful error handling
- Clear user feedback
- Intuitive UX

---

**End of Design Document**

*This document will be updated as implementation progresses.*
