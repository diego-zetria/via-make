# VSL Frontend System - Quick Start Guide

**For Next Claude 4.5 Session**
**Date:** 2025-10-18

---

## 🚀 Start Here

### What You Need to Know in 60 Seconds

1. **Project**: Web frontend for VSL Media Generation with GPT-5 multi-agent system
2. **Critical**: MUST use GPT-5 (NOT gpt-4/gpt-4o/gpt-4.1)
3. **Status**: Design complete, implementation Phase 1 starting
4. **Goal**: Minimalist UI for creating mini-series/novelas with AI assistance

### Key Documents (Read in Order)
1. 📋 `IMPLEMENTATION_STATUS.md` - Complete status (17 KB)
2. 📐 `DESIGN_FRONTEND_SYSTEM.md` - Full design specs (56 KB)
3. 📖 `DEPLOYMENT.md` - Existing infrastructure (68 KB)

---

## ⚡ Phase 1: Foundation Setup (START HERE)

### Step 1: Backend Initialization (30 min)

```bash
# Navigate to project root
cd /Users/diegoramos/Documents/cloudville/2025/vsl

# Create backend directory
mkdir backend
cd backend

# Initialize Node.js project
npm init -y

# Install dependencies
npm install express typescript @types/node @types/express socket.io \
  prisma @prisma/client openai @aws-sdk/client-s3 redis ioredis \
  cors dotenv winston zod

# Install dev dependencies
npm install -D @types/cors nodemon ts-node

# Initialize TypeScript
npx tsc --init
```

**Expected Output:**
- ✅ `backend/package.json` created
- ✅ `backend/tsconfig.json` created
- ✅ All dependencies installed

---

### Step 2: Create Project Structure (15 min)

```bash
# From /backend directory
mkdir -p src/{agents,services/{openai,lambda,s3,novela},routes,socket,utils}
mkdir -p src/services/openai
mkdir -p src/services/lambda
mkdir -p src/services/s3
mkdir -p src/services/novela
mkdir -p prisma

# Create main files
touch src/server.ts
touch src/agents/{scriptWriter,systemIntegrator,fallbackHandler,communicationBus}.ts
touch src/services/openai/gpt5Client.ts
touch src/services/lambda/lambdaClient.ts
touch src/services/s3/s3Service.ts
touch src/services/novela/novelaService.ts
touch src/routes/{novelas,agent,media}.ts
touch src/socket/socketHandlers.ts
touch src/utils/{logger,helpers}.ts
touch .env.example
touch prisma/schema.prisma
```

**Expected Structure:**
```
backend/
├── src/
│   ├── server.ts
│   ├── agents/
│   │   ├── scriptWriter.ts
│   │   ├── systemIntegrator.ts
│   │   ├── fallbackHandler.ts
│   │   └── communicationBus.ts
│   ├── services/
│   │   ├── openai/
│   │   │   └── gpt5Client.ts
│   │   ├── lambda/
│   │   │   └── lambdaClient.ts
│   │   ├── s3/
│   │   │   └── s3Service.ts
│   │   └── novela/
│   │       └── novelaService.ts
│   ├── routes/
│   │   ├── novelas.ts
│   │   ├── agent.ts
│   │   └── media.ts
│   ├── socket/
│   │   └── socketHandlers.ts
│   └── utils/
│       ├── logger.ts
│       └── helpers.ts
├── prisma/
│   └── schema.prisma
├── package.json
├── tsconfig.json
└── .env.example
```

---

### Step 3: Configure Prisma Schema (20 min)

**File: `backend/prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// =============================================================================
// NOVELAS TABLE
// =============================================================================
model Novela {
  id                      String   @id @default(cuid())
  title                   String
  description             String?  @db.Text
  genre                   String?
  targetEpisodes          Int      @map("target_episodes")
  createdVideos           Int      @default(0) @map("created_videos")
  totalCost               Decimal  @default(0) @db.Decimal(10, 2) @map("total_cost")
  estimatedCost           Decimal? @db.Decimal(10, 2) @map("estimated_cost")
  defaultModelId          String?  @map("default_model_id")
  defaultDuration         Int      @default(8) @map("default_duration")
  defaultResolution       String   @default("1080p") @map("default_resolution")
  defaultAspectRatio      String   @default("16:9") @map("default_aspect_ratio")
  referenceCharacterImages Json?   @map("reference_character_images")
  masterSeed              Int?     @map("master_seed")
  status                  String   @default("planning")
  createdAt               DateTime @default(now()) @map("created_at")
  updatedAt               DateTime @updatedAt @map("updated_at")

  videos         NovelaVideo[]
  agentMessages  AgentMessage[]
  mediaLibrary   MediaLibrary[]
  chatMessages   UserChatMessage[]

  @@index([status])
  @@index([createdAt])
  @@map("novelas")
}

// =============================================================================
// NOVELA_VIDEOS TABLE
// =============================================================================
model NovelaVideo {
  id                  String   @id @default(cuid())
  novelaId            String   @map("novela_id")
  episodeNumber       Int      @map("episode_number")
  sceneNumber         Int      @map("scene_number")
  title               String?
  scriptPrompt        String   @db.Text @map("script_prompt")
  modelId             String   @map("model_id")
  modelParameters     Json     @map("model_parameters")
  jobId               String?  @map("job_id")
  status              String   @default("pending")
  replicateStatus     String?  @map("replicate_status")
  outputUrl           String?  @db.Text @map("output_url")
  s3Key               String?  @map("s3_key")
  thumbnailUrl        String?  @db.Text @map("thumbnail_url")
  durationSeconds     Int?     @map("duration_seconds")
  fileSizeBytes       BigInt?  @map("file_size_bytes")
  estimatedCost       Decimal? @db.Decimal(10, 2) @map("estimated_cost")
  actualCost          Decimal? @db.Decimal(10, 2) @map("actual_cost")
  createdByAgent      String?  @map("created_by_agent")
  validatedByAgent    String?  @map("validated_by_agent")
  agentConversationId String?  @map("agent_conversation_id")
  createdAt           DateTime @default(now()) @map("created_at")
  startedAt           DateTime? @map("started_at")
  completedAt         DateTime? @map("completed_at")

  novela        Novela         @relation(fields: [novelaId], references: [id], onDelete: Cascade)
  agentMessages AgentMessage[]
  mediaLibrary  MediaLibrary[]

  @@unique([novelaId, episodeNumber, sceneNumber])
  @@index([novelaId])
  @@index([jobId])
  @@index([status])
  @@index([episodeNumber, sceneNumber])
  @@map("novela_videos")
}

// =============================================================================
// AGENT_MESSAGES TABLE
// =============================================================================
model AgentMessage {
  id               String   @id @default(cuid())
  conversationId   String   @map("conversation_id")
  fromAgent        String   @map("from_agent")
  toAgent          String?  @map("to_agent")
  messageType      String   @map("message_type")
  action           String
  content          Json
  metadata         Json?
  novelaId         String?  @map("novela_id")
  videoId          String?  @map("video_id")
  responseToId     String?  @map("response_to")
  responseReceived Boolean  @default(false) @map("response_received")
  createdAt        DateTime @default(now()) @map("created_at")

  novela     Novela?       @relation(fields: [novelaId], references: [id], onDelete: SetNull)
  video      NovelaVideo?  @relation(fields: [videoId], references: [id], onDelete: SetNull)
  responseTo AgentMessage? @relation("MessageResponses", fields: [responseToId], references: [id])
  responses  AgentMessage[] @relation("MessageResponses")

  @@index([conversationId])
  @@index([fromAgent])
  @@index([toAgent])
  @@index([novelaId])
  @@index([createdAt])
  @@map("agent_messages")
}

// =============================================================================
// MEDIA_LIBRARY TABLE
// =============================================================================
model MediaLibrary {
  id              String   @id @default(cuid())
  s3Key           String   @unique @map("s3_key")
  s3Url           String   @db.Text @map("s3_url")
  mediaType       String   @map("media_type")
  fileName        String?  @map("file_name")
  fileSizeBytes   BigInt?  @map("file_size_bytes")
  durationSeconds Int?     @map("duration_seconds")
  width           Int?
  height          Int?
  format          String?
  title           String?
  description     String?  @db.Text
  tags            Json?
  novelaId        String?  @map("novela_id")
  videoId         String?  @map("video_id")
  jobId           String?  @map("job_id")
  thumbnailUrl    String?  @db.Text @map("thumbnail_url")
  thumbnailS3Key  String?  @map("thumbnail_s3_key")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  novela Novela?      @relation(fields: [novelaId], references: [id], onDelete: SetNull)
  video  NovelaVideo? @relation(fields: [videoId], references: [id], onDelete: SetNull)

  @@index([s3Key])
  @@index([mediaType])
  @@index([novelaId])
  @@index([jobId])
  @@index([createdAt])
  @@map("media_library")
}

// =============================================================================
// USER_CHAT_MESSAGES TABLE
// =============================================================================
model UserChatMessage {
  id           String   @id @default(cuid())
  sessionId    String   @map("session_id")
  role         String
  content      String   @db.Text
  agentRole    String?  @map("agent_role")
  novelaId     String?  @map("novela_id")
  errorContext Json?    @map("error_context")
  createdAt    DateTime @default(now()) @map("created_at")

  novela Novela? @relation(fields: [novelaId], references: [id], onDelete: SetNull)

  @@index([sessionId])
  @@index([createdAt])
  @@map("user_chat_messages")
}
```

**Run Migration:**
```bash
# From /backend directory
npx prisma migrate dev --name init
npx prisma generate
```

**Expected Output:**
- ✅ Database tables created
- ✅ Prisma Client generated

---

### Step 4: Create Environment Configuration (10 min)

**File: `backend/.env.example`**

```bash
# Database
DATABASE_URL="postgresql://user:pass@staging-shopify.xxxxx.us-east-1.rds.amazonaws.com:5432/vsl_frontend"

# Redis
REDIS_URL="redis://localhost:6379"

# OpenAI GPT-5
OPENAI_API_KEY="sk-..."
OPENAI_MODEL="gpt-5"

# AWS
AWS_REGION="us-east-1"
AWS_ACCESS_KEY_ID="..."
AWS_SECRET_ACCESS_KEY="..."

# S3
S3_BUCKET="vsl-homolog-media"

# Lambda
LAMBDA_API_URL="https://jp4xy0391j.execute-api.us-east-1.rds.amazonaws.com/homolog"

# Server
PORT=3001
NODE_ENV="development"

# Socket.IO
SOCKET_IO_CORS_ORIGIN="http://localhost:3000"

# Logging
LOG_LEVEL="info"
```

**Action:**
```bash
cp .env.example .env
# Edit .env with actual values
```

---

### Step 5: Create Basic Express Server (20 min)

**File: `backend/src/server.ts`**

```typescript
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.SOCKET_IO_CORS_ORIGIN || 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
});

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Socket.IO connection
io.on('connection', (socket) => {
  console.log('✅ Client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('❌ Client disconnected:', socket.id);
  });
});

// Start server
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Socket.IO ready on port ${PORT}`);
});

export { app, io };
```

**Update `package.json` scripts:**
```json
{
  "scripts": {
    "dev": "nodemon --exec ts-node src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js"
  }
}
```

**Test Server:**
```bash
npm run dev
```

**Expected Output:**
```
🚀 Server running on port 3001
📡 Socket.IO ready on port 3001
```

---

### Step 6: Test GPT-5 Connection (15 min)

**File: `backend/src/services/openai/gpt5Client.ts`**

```typescript
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function testGPT5Connection(): Promise<boolean> {
  try {
    console.log('🧪 Testing GPT-5 connection...');

    const response = await openai.chat.completions.create({
      model: 'gpt-5',
      messages: [
        { role: 'user', content: 'Hello, confirm you are GPT-5' },
      ],
      max_tokens: 50,
    });

    const content = response.choices[0].message.content;
    console.log('✅ GPT-5 Response:', content);
    console.log('📊 Tokens used:', response.usage?.total_tokens);

    return true;
  } catch (error: any) {
    console.error('❌ GPT-5 Connection Failed:', error.message);
    return false;
  }
}

// Test immediately
testGPT5Connection();
```

**Test:**
```bash
ts-node src/services/openai/gpt5Client.ts
```

**Expected Output:**
```
🧪 Testing GPT-5 connection...
✅ GPT-5 Response: Yes, I am GPT-5...
📊 Tokens used: 25
```

---

### Step 7: Frontend Initialization (25 min)

```bash
# From project root
cd /Users/diegoramos/Documents/cloudville/2025/vsl

# Create Next.js 15 project
npx create-next-app@15 frontend --typescript --tailwind --app --src-dir --import-alias "@/*"

cd frontend

# Install dependencies
npm install zustand socket.io-client @tanstack/react-query axios
```

**Create stores directory:**
```bash
mkdir -p src/stores
touch src/stores/novelaStore.ts
```

**File: `frontend/src/stores/novelaStore.ts`**

```typescript
import { create } from 'zustand';

interface Novela {
  id: string;
  title: string;
  description?: string;
  status: string;
  createdAt: Date;
}

interface NovelaState {
  novelas: Novela[];
  activeNovela: Novela | null;

  setNovelas: (novelas: Novela[]) => void;
  setActiveNovela: (novela: Novela | null) => void;
}

export const useNovelaStore = create<NovelaState>((set) => ({
  novelas: [],
  activeNovela: null,

  setNovelas: (novelas) => set({ novelas }),
  setActiveNovela: (novela) => set({ activeNovela: novela }),
}));
```

**File: `frontend/.env.local`**

```bash
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001
```

**Test Frontend:**
```bash
npm run dev
```

**Expected Output:**
```
▲ Next.js 15.0.0
- Local:        http://localhost:3000
```

---

## ✅ Phase 1 Completion Checklist

After completing all steps, verify:

- [ ] Backend server running on port 3001
- [ ] Frontend running on port 3000
- [ ] Database migrated with 4 new tables
- [ ] GPT-5 connection tested successfully
- [ ] Socket.IO server ready
- [ ] Environment variables configured
- [ ] Prisma Client generated

**Time to Complete:** ~2.5 hours

---

## 🎯 Next Steps (Phase 2)

Once Phase 1 is complete, proceed to:

1. **Implement Agent 1: Script Writer** (`src/agents/scriptWriter.ts`)
2. **Implement Agent 2: System Integrator** (`src/agents/systemIntegrator.ts`)
3. **Implement Agent 3: Fallback Handler** (`src/agents/fallbackHandler.ts`)
4. **Create Communication Bus** (`src/agents/communicationBus.ts`)

See `IMPLEMENTATION_STATUS.md` Phase 2 for detailed instructions.

---

## 📞 Troubleshooting

### GPT-5 Connection Failed
- Verify `OPENAI_API_KEY` in `.env`
- Check if GPT-5 is available in your OpenAI account
- Try with `gpt-4o` temporarily to test connection (THEN SWITCH BACK TO GPT-5)

### Database Migration Failed
- Verify `DATABASE_URL` is correct
- Check PostgreSQL is running and accessible
- Ensure database user has CREATE TABLE permissions

### Port Already in Use
- Backend (3001): `lsof -ti:3001 | xargs kill`
- Frontend (3000): `lsof -ti:3000 | xargs kill`

---

## 📚 Quick Command Reference

```bash
# Backend
cd backend
npm run dev                 # Start development server
npx prisma migrate dev      # Run migrations
npx prisma studio           # Open Prisma Studio

# Frontend
cd frontend
npm run dev                 # Start Next.js dev server
npm run build               # Build for production

# Testing
curl http://localhost:3001/health  # Test backend
curl http://localhost:3000          # Test frontend
```

---

**You're now ready to start Phase 1 implementation!** 🚀

*See `IMPLEMENTATION_STATUS.md` for complete roadmap and detailed specifications.*
