# VSL Backend - Testing Workflow

**Phase 2 Complete:** GPT-5 Multi-Agent System with Success Logging ✅

## System Overview

The VSL Backend is now fully operational with:
- **3 GPT-5 Agents**: Script Writer, System Integrator, Fallback Handler
- **Communication Bus**: Inter-agent messaging with Socket.IO
- **Database**: PostgreSQL with `vsl_frontend` schema
- **Success Logging**: Visual indicators for easy debugging

---

## Quick Start

### 1. Start the Backend Server

```bash
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
🤖 GPT-5 Multi-Agent System ready
✅ Database connection successful
```

### 2. Test Script Writer Agent

```bash
curl -X POST http://localhost:3001/api/agents/test-script | python3 -m json.tool
```

**Expected Success Response:**
```json
{
    "success": true,
    "message": "Scene 1 script generated successfully",
    "data": {
        "script": {
            "sceneDescription": "Full narrative scene with dialogue...",
            "visualPrompt": "Cinematic description for AI video generation...",
            "audioPrompt": "Ambient sounds and music suggestions...",
            "characterActions": ["Action 1", "Action 2"],
            "estimatedDuration": 8
        }
    }
}
```

**Expected Server Logs (SuccessLogger):**
```
🚀 STARTING: Script Writer - Scene 1...
🤖 script_writer calling GPT-5...
✅ script_writer received response (1428 chars)
📨 script_writer sent message to ALL

============================================================
✅ SUCCESS #1: Script Writer - Scene 1 completed
📊 Details: {
  "sceneNumber": 1,
  "visualPromptLength": 279,
  "estimatedDuration": 8
}
============================================================
```

---

## Database Setup

### Create Tables (if needed)

```bash
DATABASE_URL="postgresql://master:mCRiHsy97HJI9HYpd5JULqjqVSTrh0tZbj@staging-shopify.cra22aoqsnp8.us-east-1.rds.amazonaws.com:5432/chatbot?schema=vsl_frontend" npx prisma db push
```

### Seed Test Data

```bash
DATABASE_URL="postgresql://master:mCRiHsy97HJI9HYpd5JULqjqVSTrh0tZbj@staging-shopify.cra22aoqsnp8.us-east-1.rds.amazonaws.com:5432/chatbot?schema=vsl_frontend" npm run prisma:seed
```

**Expected Output:**
```
🌱 Seeding database...
✅ Created test novela: test-novela-1
✅ Created test novela: test-novela-2

✅ Seeding complete!
📊 Database now has:
  - 2 test novelas
  - Ready for agent testing
```

---

## API Endpoints

### Health Check
```bash
curl http://localhost:3001/health
```

### Test GPT-5 Connection
```bash
curl http://localhost:3001/api/test-gpt5
```

### Script Writer Agent
```bash
curl -X POST http://localhost:3001/api/agents/test-script
```

### Agent Stats
```bash
curl http://localhost:3001/api/agents/stats
```

---

## Success Logging System

### Features

The `SuccessLogger` utility provides:
- **Visual Success Indicators**: `============================================================`
- **Operation Tracking**: `SUCCESS #1`, `SUCCESS #2`, etc.
- **Detailed Metrics**: Scene number, prompt length, duration
- **Error Tracking**: `ERROR #1` with full stack traces

### Example Logs

**Success:**
```
============================================================
✅ SUCCESS #1: Script Writer - Scene 1 completed
📊 Details: {"sceneNumber": 1, "visualPromptLength": 279}
============================================================
```

**Error:**
```
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
❌ ERROR #1: Script Writer - Scene 1
📋 Message: GPT-5 API error: rate limit exceeded
📚 Stack: [full stack trace]
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
```

### Get Stats

The SuccessLogger tracks:
- Total successes
- Total errors
- Success rate percentage

---

## Database Schema

### Tables (vsl_frontend schema)

1. **novelas** - Main novela projects
2. **novela_videos** - Generated video scenes
3. **agent_messages** - Inter-agent communication log
4. **user_chat_messages** - User interactions
5. **media_library** - S3 media references

### Test Data

**Test Novela 1:** `test-novela-1`
- Title: "Amor em Tempos Modernos"
- Genre: Romantic Drama
- Episodes: 120
- Model: minimax-video-01

**Test Novela 2:** `test-novela-2`
- Title: "Segredos do Passado"
- Genre: Mystery Drama
- Episodes: 80
- Model: luma-ray

---

## Troubleshooting

### Issue: "Table does not exist"

**Solution:** Ensure DATABASE_URL has correct schema parameter:
```bash
export DATABASE_URL="postgresql://master:mCRiHsy97HJI9HYpd5JULqjqVSTrh0tZbj@staging-shopify.cra22aoqsnp8.us-east-1.rds.amazonaws.com:5432/chatbot?schema=vsl_frontend"
```

### Issue: "Port 3001 already in use"

**Solution:**
```bash
lsof -ti:3001 | xargs kill -9
```

### Issue: Prisma Client out of sync

**Solution:**
```bash
rm -rf node_modules/.prisma node_modules/@prisma/client
DATABASE_URL="..." npx prisma generate
```

---

## Next Steps

1. **Test System Integrator Agent** - Cost estimation and Lambda API integration
2. **Test Fallback Handler Agent** - Error recovery and retry logic
3. **Test Complete Workflow** - Script → Estimation → Video Generation
4. **Frontend Integration** - Connect Socket.IO client for real-time updates

---

## Key Files

- `src/agents/ScriptWriterAgent.ts` - GPT-5 script generation
- `src/agents/SystemIntegratorAgent.ts` - Lambda API integration
- `src/agents/FallbackHandlerAgent.ts` - Error handling
- `src/agents/AgentManager.ts` - Orchestration
- `src/agents/CommunicationBus.ts` - Message routing
- `src/utils/successLogger.ts` - Visual logging utility
- `prisma/seed.ts` - Test data seeding

---

**Status:** ✅ Phase 2 Complete - Ready for production testing
**Last Updated:** 2025-10-18
