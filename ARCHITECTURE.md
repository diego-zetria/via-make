# Arquitetura do Sistema VSL com IA

## 📋 Visão Geral do Projeto

Sistema completo para criação de VSLs (Video Sales Letters) profissionais com geração automática de vídeos usando Inteligência Artificial. O sistema integra múltiplos agentes GPT-5 para análise, sugestões e geração de conteúdo persuasivo, além de orquestração de Lambda Functions AWS para geração de mídia via Replicate API.

---

## 🏗️ Arquitetura Geral

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Next.js)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐    │
│  │   Script     │  │   Lambda     │  │  Video Generation  │    │
│  │   Editor     │  │   Config     │  │     Panel          │    │
│  │              │  │   Wizard     │  │                    │    │
│  └──────────────┘  └──────────────┘  └────────────────────┘    │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTP API (REST)
┌────────────────────────▼────────────────────────────────────────┐
│                      BACKEND (Express + TypeScript)              │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │              MULTI-AGENT SYSTEM (GPT-5)                │    │
│  │  ┌─────────────────┐  ┌──────────────────────────┐    │    │
│  │  │ ScriptWriter    │  │  VSLSpecialist           │    │    │
│  │  │ Agent           │  │  Agent                   │    │    │
│  │  └─────────────────┘  └──────────────────────────┘    │    │
│  │  ┌─────────────────┐  ┌──────────────────────────┐    │    │
│  │  │ LambdaConfig    │  │  SystemIntegrator        │    │    │
│  │  │ Agent           │  │  Agent                   │    │    │
│  │  └─────────────────┘  └──────────────────────────┘    │    │
│  │  ┌─────────────────┐                                   │    │
│  │  │ FallbackHandler │                                   │    │
│  │  │ Agent           │                                   │    │
│  │  └─────────────────┘                                   │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │                    API ROUTES                          │    │
│  │  • /api/vsl/*      - VSL CRUD operations               │    │
│  │  • /api/lambda/*   - Lambda config & jobs              │    │
│  └────────────────────────────────────────────────────────┘    │
└────────────────────────┬────────────────────────────────────────┘
                         │ Prisma ORM
┌────────────────────────▼────────────────────────────────────────┐
│                    PostgreSQL Database                           │
│                                                                  │
│  Schema: vsl_frontend                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Projects   │  │   Sections   │  │ LambdaConfig │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│  ┌──────────────┐                                               │
│  │  LambdaJobs  │                                               │
│  └──────────────┘                                               │
└─────────────────────────────────────────────────────────────────┘

External Services:
┌──────────────────┐      ┌─────────────────┐      ┌──────────────┐
│  AWS Lambda      │─────▶│  Replicate API  │─────▶│   S3 Bucket  │
│  (Orchestrator)  │      │  (9 AI Models)  │      │  (Storage)   │
└──────────────────┘      └─────────────────┘      └──────────────┘
```

---

## 🗂️ Estrutura de Diretórios

```
/vsl
├── backend/                          # Express + TypeScript Backend
│   ├── prisma/
│   │   └── schema.prisma            # Database schema definition
│   ├── src/
│   │   ├── agents/                  # GPT-5 Multi-Agent System
│   │   │   ├── AgentManager.ts      # Agent orchestration
│   │   │   ├── BaseAgent.ts         # Base agent class
│   │   │   ├── ScriptWriterAgent.ts # VSL content generation
│   │   │   ├── VSLSpecialistAgent.ts# Persuasion analysis
│   │   │   ├── LambdaConfigAgent.ts # Lambda parameter suggestions
│   │   │   ├── SystemIntegratorAgent.ts
│   │   │   ├── FallbackHandlerAgent.ts
│   │   │   ├── CommunicationBus.ts  # Inter-agent communication
│   │   │   └── types.ts             # Agent type definitions
│   │   ├── routes/
│   │   │   ├── vsl.routes.ts        # VSL CRUD endpoints
│   │   │   └── lambda.routes.ts     # Lambda config & jobs endpoints
│   │   ├── services/
│   │   │   └── prisma.service.ts    # Database service
│   │   └── server.ts                # Express app entry point
│   └── package.json
│
├── frontend/                         # Next.js 15 Frontend
│   ├── app/
│   │   ├── page.tsx                 # Home page (project creation)
│   │   └── vsl/
│   │       └── editor/
│   │           └── [projectId]/
│   │               └── page.tsx     # VSL Editor (3 tabs)
│   ├── components/
│   │   └── vsl/
│   │       ├── ScriptEditor.tsx     # Script editing with AI suggestions
│   │       ├── LambdaConfigWizard.tsx # Lambda config with AI
│   │       └── VideoGenerationPanel.tsx # Video generation UI
│   └── package.json
│
├── docs/
│   └── tmp/
│       └── sugestoes-ia.txt         # AI suggestion examples
│
├── WORKFLOW_GUIDE.md                # User workflow documentation
├── ARCHITECTURE.md                  # This file
└── README.md                        # Project overview
```

---

## 🧠 Multi-Agent System (GPT-5)

### Agent Overview

O sistema utiliza 5 agentes especializados coordenados pelo `AgentManager`:

#### 1. **ScriptWriterAgent**
- **Responsabilidade**: Geração de conteúdo persuasivo para seções VSL
- **Modelo**: GPT-5 com reasoning_effort: 'medium'
- **Input**: Template, seção, dados do projeto
- **Output**: Conteúdo otimizado para conversão

#### 2. **VSLSpecialistAgent**
- **Responsabilidade**: Análise e pontuação de persuasão (0-100)
- **Modelo**: GPT-5 com reasoning_effort: 'low'
- **Input**: Conteúdo da seção
- **Output**: Score + análise detalhada

#### 3. **LambdaConfigAgent** ⭐ (Novo)
- **Responsabilidade**: Sugestões inteligentes de parâmetros Lambda
- **Modelo**: GPT-5 com reasoning_effort: 'high'
- **Knowledge Base**: 9 modelos de IA (5 vídeo, 3 imagem, 1 áudio)
- **Input**:
  - Tipo de mídia (vídeo/imagem/áudio)
  - Contexto do VSL (script completo)
  - Público-alvo
  - Orçamento (low/medium/high)
  - Prioridade (cost/balanced/quality)
  - Tom (professional/casual/energetic/elegant)
- **Output**:
  ```typescript
  {
    suggestedConfig: {
      modelId: string,
      mediaType: string,
      parameters: {
        duration?: number,
        resolution?: string,
        aspect_ratio?: string,
        fps?: number,
        // ... model-specific params
      }
    },
    reasoning: string,
    alternatives: Array<{
      modelId: string,
      why: string,
      costComparison: string
    }>,
    estimatedCost: number,
    estimatedTime: number,
    recommendations: string[]
  }
  ```

#### 4. **SystemIntegratorAgent**
- **Responsabilidade**: Orquestração de operações complexas
- **Modelo**: GPT-5 com reasoning_effort: 'medium'

#### 5. **FallbackHandlerAgent**
- **Responsabilidade**: Tratamento de erros e recuperação
- **Modelo**: GPT-5 com reasoning_effort: 'low'

### Agent Configuration

```typescript
// Exemplo: LambdaConfigAgent
{
  role: AgentRole.LAMBDA_CONFIG,
  model: 'gpt-5',
  maxCompletionTokens: 8000,  // 2000 reasoning + 6000 response
  reasoningEffort: 'high',     // Deep analysis for intelligent suggestions
  systemPrompt: `[Detailed prompt with model specifications]`
}
```

### Communication Bus

Os agentes se comunicam através do `CommunicationBus`:
- Mensagens tipadas
- Broadcast e unicast
- Event-driven architecture
- Logging integrado

---

## 🗄️ Database Schema (Prisma)

### Schema: `vsl_frontend`

#### 1. **Project**
```prisma
model Project {
  id             String    @id @default(cuid())
  userId         String?
  projectName    String
  templateId     String    // 'pas', 'aida', 'story', 'authority'
  productService String?
  targetAudience String?
  mainProblem    String?
  priceOffer     String?
  tone           String
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  sections Section[]
}
```

#### 2. **Section**
```prisma
model Section {
  id              String   @id @default(cuid())
  projectId       String
  sectionName     String
  sectionOrder    Int
  content         String?  @db.Text
  aiSuggestion    String?  @db.Text
  persuasionScore Int      @default(0)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
}
```

#### 3. **LambdaConfig** ⭐ (Novo)
```prisma
model LambdaConfig {
  id              String    @id @default(cuid())
  userId          String?
  name            String
  description     String?   @db.Text
  lambdaName      String
  lambdaUrl       String
  mediaType       String    // 'video', 'image', 'audio'
  modelId         String    // 'wan-2.5-t2v', 'flux-schnell', etc.
  defaultParams   Json      // Model-specific parameters
  suggestedParams Json?     // AI-suggested parameters
  suggestionMeta  Json?     // AI reasoning + recommendations
  useCount        Int       @default(0)
  lastUsedAt      DateTime?
  isActive        Boolean   @default(true)
  isDefault       Boolean   @default(false)
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  jobs LambdaJob[]
}
```

#### 4. **LambdaJob** ⭐ (Novo)
```prisma
model LambdaJob {
  id              String    @id @default(cuid())
  configId        String?
  userId          String?
  projectId       String?
  jobId           String    @unique
  lambdaName      String
  mediaType       String
  modelId         String
  prompt          String    @db.Text
  parameters      Json
  replicateId     String?
  status          String    @default("pending")
  resultUrl       String?
  s3Path          String?
  fileSize        Int?
  estimatedCost   Decimal?  @db.Decimal(10, 4)
  actualCost      Decimal?  @db.Decimal(10, 4)
  estimatedTime   Int?
  processingTime  Int?
  error           String?   @db.Text
  retryCount      Int       @default(0)
  metadata        Json?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  completedAt     DateTime?

  config LambdaConfig? @relation(fields: [configId], references: [id], onDelete: SetNull)
}
```

**Nota Importante sobre Decimal**:
- Prisma retorna campos `Decimal` como objetos Decimal, não números JavaScript
- **Conversão necessária**: `Number(value).toFixed(2)` antes de usar `.toFixed()`
- Afeta: `estimatedCost`, `actualCost`

---

## 🔌 API Endpoints

### VSL Endpoints (`/api/vsl/*`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/projects` | Create new VSL project |
| GET | `/projects/:id` | Get project with sections |
| PUT | `/sections/:id` | Update section content |
| POST | `/sections/:id/suggest` | Get AI content suggestion |
| POST | `/sections/:id/score` | Get persuasion score |

### Lambda Endpoints (`/api/lambda/*`) ⭐ (Novo)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/suggest` | Get AI suggestions for Lambda config |
| POST | `/optimize` | Optimize existing Lambda parameters |
| POST | `/configs` | Save Lambda configuration |
| GET | `/configs` | List saved configurations |
| GET | `/configs/:id` | Get specific configuration |
| PUT | `/configs/:id` | Update configuration |
| DELETE | `/configs/:id` | Delete configuration |
| POST | `/jobs` | Create new Lambda job |
| GET | `/jobs/:jobId` | Get job status |
| GET | `/jobs` | List Lambda jobs |
| GET | `/models` | Get available AI models |

---

## 🎨 Frontend Components

### 1. **ScriptEditor** (`components/vsl/ScriptEditor.tsx`)
- Multi-section editor with navigation
- AI-powered content suggestions
- Real-time persuasion scoring
- Auto-save functionality

### 2. **LambdaConfigWizard** ⭐ (Novo)
3-step wizard for Lambda configuration:

**Step 1: Type Selection**
- Choose media type: Video 🎥, Image 🖼️, Audio 🎵

**Step 2: Context Configuration**
- Budget: Low, Medium, High
- Priority: Cost, Balanced, Quality
- Tone: Professional, Casual, Energetic, Elegant

**Step 3: AI Suggestion**
- AI analyzes VSL content + context
- Recommends optimal model + parameters
- Shows estimated cost & time
- Provides alternatives with cost comparison
- Save configuration to database

**Key Features**:
- Environment variable support for Lambda URL
- Default fallback: `https://jp4xy0391j.execute-api.us-east-1.amazonaws.com/homolog/generate-media`
- Auto-navigation to video generation after save
- Comprehensive parameter display

### 3. **VideoGenerationPanel** ⭐ (Novo)
Video generation and monitoring interface:

**Features**:
- Auto-loads saved Lambda configurations
- Configuration selector dropdown
- Individual or batch video generation
- Real-time status polling (5-second intervals)
- Status badges: Pending ⏳, Processing 🔄, Completed ✅, Failed ❌
- Cost tracking per job and total
- Download buttons for completed videos
- Job summary dashboard

**Status Flow**:
```
pending → processing → completed → download available
                    ↓
                  failed → retry option
```

**Important Fix Applied**:
- Prisma Decimal conversion: `Number(job.estimatedCost).toFixed(2)`
- Prevents "toFixed is not a function" errors

### 4. **Page Integration** (`app/vsl/editor/[projectId]/page.tsx`)
Tabbed interface integrating all components:

```typescript
Tabs:
- 📝 Roteiro (ScriptEditor)
- ⚙️ Configuração Lambda (LambdaConfigWizard)
- 🎬 Gerar Vídeos (VideoGenerationPanel)
```

---

## 🤖 AI Models Available (Replicate)

### Video Models (5)

1. **stability-video**
   - Provider: Stability AI
   - Pricing: $0.20/job
   - Capabilities: High quality, various resolutions

2. **wan-2.5-t2v**
   - Provider: Wanxiang
   - Pricing: $0.40/job
   - Capabilities: Text-to-video, 8s duration, 720p

3. **wan-2.5-fast**
   - Provider: Wanxiang
   - Pricing: $0.30/job
   - Capabilities: Fast generation, reduced quality

4. **veo-3.1**
   - Provider: Google
   - Pricing: Variable
   - Capabilities: Premium, customizable resolution

5. **veo-3.1-fast**
   - Provider: Google
   - Pricing: Variable
   - Capabilities: Fast premium generation

### Image Models (3)

1. **flux-schnell**
   - Provider: Black Forest Labs
   - Pricing: $0.03/image
   - Capabilities: Fast, high quality

2. **sdxl**
   - Provider: Stability AI
   - Pricing: $0.02/image
   - Capabilities: Classic SDXL

3. **nano-banana**
   - Provider: Community
   - Pricing: $0.01/image
   - Capabilities: Ultra-fast, smaller size

### Audio Models (1)

1. **musicgen**
   - Provider: Meta
   - Pricing: $0.001/second
   - Capabilities: Music generation

---

## 🔄 Workflow Completo

### 1. Criar Projeto VSL
```
Home → Template Selection → Fill Project Details → Create
```

### 2. Editar Roteiro (Tab: 📝 Roteiro)
```
Select Section → AI Suggestion → Edit Content → Save
Repeat for all sections
```

### 3. Configurar Lambda (Tab: ⚙️ Configuração Lambda)
```
Select Media Type → Configure Context → Get AI Suggestion → Review → Save
```

**AI Suggestion Process**:
- LambdaConfigAgent analyzes VSL content
- Considers budget, priority, tone
- Recommends optimal model (e.g., wan-2.5-t2v)
- Suggests parameters (duration, resolution, aspect_ratio, fps)
- Calculates estimated cost and time
- Provides alternatives with trade-offs

### 4. Gerar Vídeos (Tab: 🎬 Gerar Vídeos)
```
Review Configuration → Generate All Videos (or individual) → Monitor Status → Download
```

**Job Lifecycle**:
1. Create job in database (status: pending)
2. Call Lambda function with parameters
3. Lambda calls Replicate API
4. Poll status every 5 seconds
5. Update status: processing → completed
6. Download from S3

---

## 🔧 Technical Details

### Environment Variables

**Backend** (`.env`):
```bash
DATABASE_URL="postgresql://master:password@host:5432/chatbot?schema=vsl_frontend"
OPENAI_API_KEY="sk-..."
OPENAI_MODEL="gpt-5"
PORT=3001
```

**Frontend** (`.env.local`):
```bash
NEXT_PUBLIC_LAMBDA_URL="https://...execute-api.us-east-1.amazonaws.com/homolog/generate-media"
```

### Key Technologies

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **Backend**: Express, TypeScript, Prisma ORM
- **Database**: PostgreSQL (schema: vsl_frontend)
- **AI**: OpenAI GPT-5 (with reasoning capabilities)
- **Infrastructure**: AWS Lambda, Replicate API, S3
- **Communication**: REST API, JSON payloads

### Important Implementation Notes

1. **GPT-5 Reasoning Tokens**:
   - `maxCompletionTokens` must include reasoning tokens + response tokens
   - Example: 8000 total = 2000 reasoning + 6000 response

2. **Prisma Decimal Handling**:
   - Always convert to Number before using JavaScript number methods
   - `Number(value).toFixed(2)` instead of `value.toFixed(2)`

3. **Lambda URL Fallback**:
   - Environment variable with hardcoded fallback
   - Prevents "missing required field" errors

4. **Job Status Polling**:
   - 5-second intervals
   - Stops when all jobs are completed or failed
   - Efficient: only polls active jobs

---

## 📊 Data Flow Examples

### Example 1: AI Content Suggestion
```
User clicks "Sugestão da IA"
  ↓
Frontend POST /api/vsl/sections/:id/suggest
  ↓
Backend → AgentManager.getSuggestion()
  ↓
ScriptWriterAgent.process() with GPT-5
  ↓
Returns AI-generated content
  ↓
Frontend displays in editor
```

### Example 2: Lambda Configuration with AI
```
User fills context (budget, priority, tone)
  ↓
Frontend POST /api/lambda/suggest
  ↓
Backend → AgentManager.getLambdaConfigSuggestion()
  ↓
LambdaConfigAgent.process() with GPT-5 (high reasoning)
  ↓
Returns { suggestedConfig, reasoning, alternatives, costs }
  ↓
Frontend displays recommendations
  ↓
User saves configuration
  ↓
Backend stores in LambdaConfig table
```

### Example 3: Video Generation
```
User clicks "Gerar Vídeo"
  ↓
Frontend POST /api/lambda/jobs
  ↓
Backend creates LambdaJob (status: pending)
  ↓
Backend calls AWS Lambda with payload
  ↓
Lambda orchestrates Replicate API call
  ↓
Replicate generates video with AI model
  ↓
Lambda uploads to S3 + updates job status
  ↓
Frontend polling detects status: completed
  ↓
User downloads from S3
```

---

## 🐛 Known Issues & Fixes

### Fixed Issues:

1. **Missing Lambda URL** ✅
   - **Problem**: Required field `lambdaUrl` was empty
   - **Fix**: Added default fallback URL
   - **Location**: LambdaConfigWizard.tsx:104

2. **Decimal.toFixed() Error** ✅
   - **Problem**: Prisma Decimal type incompatible with `.toFixed()`
   - **Fix**: Convert to Number first: `Number(value).toFixed(2)`
   - **Locations**: VideoGenerationPanel.tsx:353, 389

---

## 🚀 Next Steps (Pending Implementation)

### 1. **Lambda Function Integration**
Currently, jobs are created in the database but need actual Lambda invocation:
- Implement webhook for job status updates
- Handle Replicate API responses
- Process S3 upload notifications

### 2. **Error Handling & Retry Logic**
- Automatic retry on Lambda failures
- Circuit breaker for Replicate API
- User-friendly error messages

### 3. **Cost Tracking & Analytics**
- Real-time cost dashboard
- Budget alerts
- Usage analytics per user/project

### 4. **Video Preview**
- In-app video player
- Thumbnail generation
- Quick preview before download

### 5. **User Authentication**
- Implement user system
- Per-user project isolation
- Role-based access control

### 6. **Batch Operations**
- Queue system for multiple jobs
- Concurrent job limits
- Priority queuing

---

## 📝 Testing Checklist

### Backend:
- ✅ Database migrations applied
- ✅ All API endpoints created
- ✅ Multi-agent system integrated
- ✅ Error handling implemented
- ⏳ Lambda function calls (needs testing)
- ⏳ Webhook integration (needs implementation)

### Frontend:
- ✅ ScriptEditor functional
- ✅ LambdaConfigWizard working
- ✅ VideoGenerationPanel created
- ✅ Tab navigation working
- ✅ AI suggestions displaying
- ✅ Cost calculations fixed
- ⏳ End-to-end video generation (needs testing)

### Integration:
- ✅ Frontend ↔ Backend API communication
- ✅ Prisma ↔ PostgreSQL persistence
- ✅ Multi-agent system coordination
- ⏳ Lambda ↔ Replicate integration
- ⏳ S3 upload and storage

---

## 🎯 Project Status Summary

**Completed Components**:
1. ✅ Multi-agent system (5 agents + AgentManager)
2. ✅ Database schema (4 models: Project, Section, LambdaConfig, LambdaJob)
3. ✅ API endpoints (15 endpoints total)
4. ✅ Frontend UI (3 main components + tabbed interface)
5. ✅ AI-powered Lambda configuration suggestions
6. ✅ Video generation panel with status tracking
7. ✅ Error fixes (Lambda URL, Decimal conversion)
8. ✅ Documentation (WORKFLOW_GUIDE.md, ARCHITECTURE.md)

**System State**:
- Backend running on port 3001
- Frontend running on port 3000
- Database connected and migrated
- All AI agents functional
- Ready for end-to-end testing

**Next Testing Phase**:
1. Test complete workflow: Script → Lambda Config → Video Generation
2. Verify Lambda function integration
3. Test video download from S3
4. Validate cost tracking accuracy

---

## 📞 Support & Maintenance

**Key Files for Debugging**:
- Backend logs: Console output from Express server
- Frontend logs: Browser console + Network tab
- Database queries: Prisma debug logs
- AI interactions: AgentManager logging

**Common Debugging Steps**:
1. Check backend server is running (port 3001)
2. Check frontend server is running (port 3000)
3. Verify DATABASE_URL environment variable
4. Check OPENAI_API_KEY is valid
5. Review browser Network tab for API errors
6. Check Prisma schema matches database

---

**Document Created**: 2025-10-18
**Last Updated**: 2025-10-18
**Version**: 1.0.0
**Status**: Production-ready for testing
