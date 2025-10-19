# VSL Complete System Guide

**Phase 2 Complete:** Next.js Frontend + GPT-5 Multi-Agent Backend ✅

## System Overview

### Architecture
```
┌─────────────────────────────────────────────────────┐
│                                                     │
│  Frontend (Next.js) - Port 3000                    │
│  - Dashboard with novela management                │
│  - Real-time Script Generator                      │
│  - Agent Monitor with live updates                 │
│                                                     │
└──────────────┬──────────────────────────────────────┘
               │
               │ HTTP API + Socket.IO
               │
┌──────────────▼──────────────────────────────────────┐
│                                                     │
│  Backend (Express + Socket.IO) - Port 3001        │
│  - GPT-5 Multi-Agent System                       │
│  - PostgreSQL Database (vsl_frontend schema)       │
│  - Real-time communication bus                     │
│                                                     │
└─────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Start Backend (Terminal 1)

```bash
cd /Users/diegoramos/Documents/cloudville/2025/vsl/backend

export DATABASE_URL="postgresql://master:mCRiHsy97HJI9HYpd5JULqjqVSTrh0tZbj@staging-shopify.cra22aoqsnp8.us-east-1.rds.amazonaws.com:5432/chatbot?schema=vsl_frontend"

npm run dev
```

**Expected Output:**
```
✅ Communication Bus initialized
✅ Agent initialized: script_writer
✅ Agent initialized: system_integrator
✅ Agent initialized: fallback_handler
✅ Agent Manager created
🚀 VSL Backend Server running on port 3001
📡 Socket.IO server ready
🤖 GPT-5 Multi-Agent System ready
✅ Database connection successful
```

### 2. Start Frontend (Terminal 2)

```bash
cd /Users/diegoramos/Documents/cloudville/2025/vsl/frontend

npm run dev
```

**Expected Output:**
```
▲ Next.js 15.5.6
- Local:        http://localhost:3000
✓ Ready in 1448ms
```

### 3. Open Browser

Navigate to: **http://localhost:3000**

---

## Using the System

### Dashboard Features

#### 1. Novela Management
- View all novelas with status, genre, and progress
- Select a novela to generate scripts
- Real-time cost tracking

#### 2. Script Generation
- **Select Novela**: Click on any novela card
- **Scene Number**: Enter the scene number to generate
- **Scene Context** (optional): Describe what should happen
- **Generate**: Click button to trigger GPT-5
- **Results**: View complete script with:
  - Scene description (Portuguese)
  - Visual prompt for AI video generation
  - Audio prompt
  - Character actions
  - Estimated duration

#### 3. Agent Monitor (Sidebar)
- Real-time agent communication
- Color-coded by agent type:
  - 🟣 **Script Writer** - Scene generation
  - 🔵 **System Integrator** - Cost estimation
  - 🟠 **Fallback Handler** - Error recovery
- Priority indicators: 🚨 URGENT, ⚠️ HIGH, ℹ️ MEDIUM, 💬 LOW

---

## API Endpoints

### Novelas
- `GET /api/novelas` - List all novelas
- `GET /api/novelas/:id` - Get single novela with videos

### Agents
- `POST /api/agents/test-script` - Test script writer
- `POST /api/agents/generate-script` - Generate scene script
  ```json
  {
    "novelaId": "test-novela-1",
    "sceneNumber": 1,
    "sceneContext": "Optional context",
    "duration": 8
  }
  ```
- `GET /api/agents/stats` - Get agent statistics
- `GET /api/agents/messages` - Get agent messages
  - Query param: `?novelaId=test-novela-1`

### System
- `GET /health` - Health check

---

## Database

### Test Data

Two novelas are pre-seeded:

**Novela 1:** `test-novela-1`
- Title: "Amor em Tempos Modernos"
- Genre: Romantic Drama
- Episodes: 120
- Model: minimax-video-01
- Characters: Maria (30), João (35)

**Novela 2:** `test-novela-2`
- Title: "Segredos do Passado"
- Genre: Mystery Drama
- Episodes: 80
- Model: luma-ray

### Schema
- `vsl_frontend.novelas` - Novela projects
- `vsl_frontend.novela_videos` - Generated scenes
- `vsl_frontend.agent_messages` - Agent communication log
- `vsl_frontend.user_chat_messages` - User interactions
- `vsl_frontend.media_library` - S3 media references

---

## Complete Workflow Example

### 1. Open Frontend
Visit http://localhost:3000

### 2. Select Novela
Click on "Amor em Tempos Modernos"

### 3. Generate Script
- Scene Number: `1`
- Scene Context: `Maria enters the elegant café and sees João for the first time`
- Click "Generate Script"

### 4. Watch Real-time Updates
Agent Monitor shows:
```
🟣 script_writer → GPT-5 processing...
ℹ️ Script Writer: Generating scene 1...
✅ Script Writer: Scene completed
```

### 5. View Results
```
Scene Description:
Interior — Café elegante, fim de tarde. Maria entra...

Visual Prompt (279 chars):
Café elegante, fim de tarde. Plano médio de Maria...

Audio Prompt:
Ambiente: murmúrio suave de café...

Character Actions:
• Maria: Entra devagar, olhar curioso
• João: Levanta-se, sorriso misterioso

Duration: 8 seconds
```

---

## Frontend Architecture

### Pages
- `/` - Main dashboard

### Components
- `NovelaCard.tsx` - Novela display with status
- `ScriptGenerator.tsx` - Script generation interface
- `AgentMonitor.tsx` - Real-time agent messages

### Libraries
- `lib/api.ts` - HTTP client for backend
- `lib/socket.ts` - Socket.IO real-time client

### Tech Stack
- Next.js 15.5.6 (App Router)
- React 19
- TypeScript
- Tailwind CSS v4
- Socket.IO Client 4.8.1

---

## Backend Architecture

### Agents
1. **Script Writer** (`ScriptWriterAgent.ts`)
   - GPT-5 powered scene generation
   - Brazilian novela expertise
   - Visual prompts for AI video

2. **System Integrator** (`SystemIntegratorAgent.ts`)
   - Cost estimation
   - Lambda API integration
   - Model selection

3. **Fallback Handler** (`FallbackHandlerAgent.ts`)
   - Error recovery
   - User assistance
   - Retry logic

### Communication
- `CommunicationBus.ts` - Event-driven messaging
- `AgentManager.ts` - High-level orchestration
- Socket.IO for real-time frontend updates

---

## Troubleshooting

### Frontend Issues

**Port 3000 already in use:**
```bash
lsof -ti:3000 | xargs kill -9
```

**Can't connect to backend:**
- Check backend is running on 3001
- Verify `.env` has correct URL
- Check CORS settings

### Backend Issues

**Port 3001 already in use:**
```bash
lsof -ti:3001 | xargs kill -9
```

**Database connection failed:**
- Ensure DATABASE_URL is exported
- Verify schema is `vsl_frontend`
- Run: `npx prisma generate`

**Agents not initializing:**
- Check OpenAI API key in `.env`
- Verify GPT-5 model access
- Check logs for specific errors

### Database Issues

**Tables don't exist:**
```bash
cd backend
DATABASE_URL="..." npx prisma db push
```

**No test data:**
```bash
DATABASE_URL="..." npm run prisma:seed
```

**Prisma client out of sync:**
```bash
rm -rf node_modules/.prisma node_modules/@prisma/client
DATABASE_URL="..." npx prisma generate
```

---

## Environment Variables

### Backend (.env)
```
PORT=3001
NODE_ENV=development

DATABASE_URL=postgresql://master:mCRiHsy97HJI9HYpd5JULqjqVSTrh0tZbj@staging-shopify.cra22aoqsnp8.us-east-1.rds.amazonaws.com:5432/chatbot?schema=vsl_frontend

OPENAI_API_KEY=sk-proj-...
OPENAI_MODEL=gpt-5-mini

SOCKET_IO_CORS_ORIGIN=http://localhost:3000

AWS_REGION=us-east-1
STAGE=homolog
S3_BUCKET=vsl-homolog-media
DYNAMODB_TABLE=vsl-homolog-realtime-jobs
LAMBDA_API_BASE_URL=https://jp4xy0391j.execute-api.us-east-1.amazonaws.com/homolog
```

### Frontend (.env or .env.local)
```
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
```

---

## Success Indicators

### Backend Startup
✅ Communication Bus initialized
✅ 3 agents initialized
✅ Database connection successful
✅ Socket.IO ready

### Frontend Startup
✅ Next.js ready on port 3000
✅ API client configured
✅ Socket.IO connected

### Script Generation
✅ Novelas load in dashboard
✅ Script generator appears on selection
✅ Real-time updates in agent monitor
✅ Complete script with all fields

---

## Next Steps (Future Enhancements)

1. **Video Generation Integration**
   - Connect to Lambda API
   - S3 upload for generated videos
   - Real-time progress tracking

2. **Cost Estimation**
   - Pre-generation cost calculation
   - Budget tracking
   - Model comparison

3. **User Authentication**
   - Login system
   - User projects
   - Permissions

4. **Advanced Features**
   - Batch scene generation
   - Custom character templates
   - Script editing and versioning
   - Export to formats (PDF, JSON)

---

**Status:** ✅ Phase 2 Complete - Full-stack system operational
**Last Updated:** 2025-10-18
**Version:** 2.0.0
