# 🏗️ Multi-Agent Architecture Proposal - VSL Frontend

**Data:** 2025-10-18
**Status:** Proposta baseada em frameworks 2025

---

## 🎯 Problema Atual

**Error identificado:**
```
Foreign key constraint violated: agent_messages_novela_id_fkey
```

**Causa:** Tentativa de criar mensagem para novela inexistente (`test-novela-1`)

**Problemas Arquiteturais:**
1. ❌ Dependência rígida entre `agent_messages` e `novelas` (foreign key)
2. ❌ Difícil debugar interações entre agentes
3. ❌ Sem observability/tracing adequado
4. ❌ Sem state management robusto
5. ❌ Implementação custom sem framework testado

---

## 🔍 Análise de Frameworks 2025

### Comparação: LangGraph vs AutoGen vs CrewAI

| Framework | Tipo | Melhor Para | Complexidade |
|-----------|------|-------------|--------------|
| **LangGraph** | Graph-based, stateful | Workflows complexos, production-grade | Alta |
| **AutoGen** | Conversational | Multi-agent conversations, code execution | Média |
| **CrewAI** | Role-based, YAML | Sequential tasks, rapid prototyping | Baixa |

### Recomendação AWS (2025)

**AWS propõe 3 padrões:**

1. **Amazon Bedrock Multi-Agent Collaboration**
   - Managed service
   - Built-in security e observability
   - Limitado a Amazon Bedrock models

2. **Agent Squad (Microservices)**
   - Cada agente como microserviço independente
   - Escalável, fault-tolerant
   - Maior complexidade operacional

3. **LangGraph Workflow Orchestration**
   - Graph-based state management
   - Open source, flexível
   - Integração com qualquer LLM (GPT-5, Bedrock, etc.)

---

## ✅ Solução Recomendada: Híbrida LangGraph + Step Functions

### Arquitetura Proposta

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (Next.js)                       │
│                    Socket.IO Real-time                       │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                  Express Backend (Current)                   │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │           LangGraph State Machine                   │    │
│  │                                                      │    │
│  │  ┌──────────────┐     ┌──────────────┐            │    │
│  │  │Script Writer │────▶│ Integration  │            │    │
│  │  │   Agent      │     │    Agent     │            │    │
│  │  └──────┬───────┘     └──────┬───────┘            │    │
│  │         │                     │                     │    │
│  │         └─────────┬───────────┘                     │    │
│  │                   ▼                                 │    │
│  │           ┌──────────────┐                         │    │
│  │           │   Fallback   │                         │    │
│  │           │    Handler   │                         │    │
│  │           └──────────────┘                         │    │
│  │                                                      │    │
│  │         State Graph (Checkpointing)                 │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │         Persistence Layer (PostgreSQL)              │    │
│  │                                                      │    │
│  │  • workflow_runs (executions)                       │    │
│  │  • workflow_checkpoints (state snapshots)           │    │
│  │  • agent_traces (observability)                     │    │
│  │  • novelas (domain data)                            │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────┬────────────────────────────────────┘
                          │
┌─────────────────────────▼────────────────────────────────────┐
│            AWS Step Functions (Long-running)                  │
│                                                               │
│  Video Generation Workflow:                                  │
│  Script → Cost Estimate → Generate → Poll → Store           │
└───────────────────────────────────────────────────────────────┘
```

---

## 📊 Nova Estrutura de Dados

### 1. Desacoplar Agent Messages de Novelas

```prisma
// Workflow execution tracking (independent)
model WorkflowRun {
  id              String   @id @default(cuid())
  workflowType    String   // script_generation, video_generation, error_recovery
  contextId       String?  // Optional: novelaId, sceneId, etc.
  contextType     String?  // Optional: novela, scene, general
  status          String   // pending, running, completed, failed
  startedAt       DateTime @default(now())
  completedAt     DateTime?
  metadata        Json?

  checkpoints     WorkflowCheckpoint[]
  traces          AgentTrace[]

  @@index([workflowType])
  @@index([status])
  @@index([contextId])
  @@map("workflow_runs")
  @@schema("vsl_frontend")
}

// State snapshots for recovery/replay
model WorkflowCheckpoint {
  id              String   @id @default(cuid())
  workflowRunId   String   @map("workflow_run_id")
  checkpointName  String   // after_script, after_estimation, etc.
  state           Json     // Full state snapshot
  createdAt       DateTime @default(now())

  workflowRun WorkflowRun @relation(fields: [workflowRunId], references: [id], onDelete: Cascade)

  @@index([workflowRunId])
  @@map("workflow_checkpoints")
  @@schema("vsl_frontend")
}

// Observability/tracing (independent)
model AgentTrace {
  id              String   @id @default(cuid())
  workflowRunId   String?  @map("workflow_run_id")
  agentName       String   // script_writer, system_integrator, fallback_handler
  action          String   // generate_script, estimate_cost, handle_error
  inputData       Json
  outputData      Json?
  status          String   // success, error
  errorMessage    String?  @db.Text
  durationMs      Int?     @map("duration_ms")
  timestamp       DateTime @default(now())

  workflowRun WorkflowRun? @relation(fields: [workflowRunId], references: [id], onDelete: SetNull)

  @@index([workflowRunId])
  @@index([agentName])
  @@index([timestamp])
  @@map("agent_traces")
  @@schema("vsl_frontend")
}

// Keep novelas separate (domain data)
model Novela {
  id                      String   @id @default(cuid())
  title                   String
  // ... existing fields

  // NO foreign key to agent_messages
  videos         NovelaVideo[]
  mediaLibrary   MediaLibrary[]
  chatMessages   UserChatMessage[]

  @@map("novelas")
  @@schema("vsl_frontend")
}
```

### Benefícios

✅ **Desacoplamento:** Agents podem funcionar sem novelas
✅ **Debug:** Traces completos de todas execuções
✅ **Recovery:** State checkpoints para retry
✅ **Observability:** Metrics, durations, errors
✅ **Flexibilidade:** Workflows para qualquer contexto

---

## 🚀 Implementação em 3 Fases

### Fase 1: Fix Imediato (1-2 horas)
**Objetivo:** Resolver erro atual sem breaking changes

1. ✅ Tornar `novelaId` **OPCIONAL** em `agent_messages`
2. ✅ Criar novela de teste no seed/migration
3. ✅ Adicionar validação: se novela não existe, usar `null`

```typescript
// Quick fix in BaseAgent.ts
await prisma.agentMessage.create({
  data: {
    ...message,
    novelaId: await this.validateNovelaId(message.novelaId),
  },
});

private async validateNovelaId(id: string): Promise<string | null> {
  const exists = await prisma.novela.findUnique({ where: { id } });
  return exists ? id : null;
}
```

---

### Fase 2: Migrar para LangGraph (1 semana)
**Objetivo:** Arquitetura production-grade com state management

#### Instalar LangGraph
```bash
npm install @langchain/langgraph @langchain/core
```

#### Definir State Graph
```typescript
import { StateGraph, Annotation } from "@langchain/langgraph";

// Define workflow state
const WorkflowState = Annotation.Root({
  novelaId: Annotation<string>(),
  sceneNumber: Annotation<number>(),
  script: Annotation<object | null>(),
  estimation: Annotation<object | null>(),
  videoJob: Annotation<object | null>(),
  errors: Annotation<string[]>(),
});

// Create graph
const workflow = new StateGraph(WorkflowState)
  .addNode("script_writer", scriptWriterNode)
  .addNode("system_integrator", systemIntegratorNode)
  .addNode("fallback_handler", fallbackHandlerNode)
  .addEdge("script_writer", "system_integrator")
  .addConditionalEdges("system_integrator", shouldRetry)
  .addEdge("fallback_handler", END);

const app = workflow.compile({
  checkpointer: new PostgresSaver(prisma), // State persistence
});
```

#### Benefícios LangGraph
- ✅ Built-in checkpointing (state recovery)
- ✅ Conditional edges (error handling)
- ✅ Human-in-the-loop support
- ✅ Time-travel debugging
- ✅ Streaming support

---

### Fase 3: Integrar Step Functions (2 semanas)
**Objetivo:** Long-running workflows com AWS orchestration

#### Use Cases para Step Functions
1. **Video Generation** (10+ minutes)
   - Trigger Lambda → Poll Replicate → Store S3
   - Built-in retry, timeout, error handling

2. **Batch Processing** (multiple scenes)
   - Parallel execution
   - Map/Reduce patterns

3. **Human Review Loops**
   - Wait for approval
   - Notify via SNS/SQS

#### Arquitetura Híbrida
```
LangGraph (Express):  Script generation, estimation, chat
    ↓
Step Functions (AWS): Video generation, long workflows
    ↓
Callback (Webhook):   Update status in Express/Socket.IO
```

---

## 📦 Dependencies Necessárias

```json
{
  "dependencies": {
    "@langchain/langgraph": "^0.2.0",
    "@langchain/core": "^0.3.0",
    "@langchain/openai": "^0.3.0",
    "langsmith": "^0.2.0"  // Observability
  }
}
```

---

## 🔍 Observability & Tracing

### LangSmith Integration
```typescript
import { Client } from "langsmith";

const client = new Client({
  apiKey: process.env.LANGSMITH_API_KEY,
});

// Automatic tracing
await client.runTree({
  name: "novela_script_generation",
  run_type: "chain",
  inputs: { novelaId, sceneNumber },
  outputs: { script },
});
```

### Benefícios
- ✅ Visual debugging de workflows
- ✅ Performance metrics
- ✅ Error tracking
- ✅ Cost monitoring

---

## 💰 Estimativa de Custo

### LangSmith (Tracing)
- **Free tier:** 5K traces/month
- **Pro:** $39/month - 100K traces

### AWS Step Functions
- **Free tier:** 4K state transitions/month
- **Paid:** $0.025 per 1K transitions

### Comparação com Implementação Atual
- **Atual:** Custom code, difícil debug, sem observability
- **LangGraph:** +$39/mês, debugging profissional, state management
- **Step Functions:** ~$10/mês (estimado), enterprise-grade orchestration

---

## 🎯 Recomendação Final

### Curto Prazo (Esta Sprint)
1. ✅ **Fix imediato:** Tornar `novelaId` opcional
2. ✅ **Adicionar tracing básico:** Console logs estruturados

### Médio Prazo (Próximas 2 semanas)
3. ✅ **Migrar para LangGraph:** State management robusto
4. ✅ **Nova estrutura DB:** `workflow_runs`, `checkpoints`, `traces`
5. ✅ **Integrar LangSmith:** Observability profissional

### Longo Prazo (1-2 meses)
6. ✅ **Step Functions:** Long-running workflows
7. ✅ **Auto-scaling:** Baseado em carga
8. ✅ **Multi-region:** Redundância

---

## 📚 Referências

- [AWS Multi-Agent Orchestration Guidance](https://aws.amazon.com/solutions/guidance/multi-agent-orchestration-on-aws/)
- [LangGraph Documentation](https://langchain-ai.github.io/langgraph/)
- [Building Scalable AI Agents with AWS Step Functions](https://guyernest.medium.com/building-scalable-ai-agents-with-aws-step-functions-a-practical-guide-1e4f6dd19764)
- [CrewAI vs LangGraph vs AutoGen Comparison](https://medium.com/@vikaskumarsingh_60821/battle-of-ai-agent-frameworks-langgraph-vs-autogen-vs-crewai-3c7bf5c18979)

---

**Criado em:** 2025-10-18
**Autor:** Claude Code
**Status:** Proposta para Aprovação
