import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { logger } from './utils/logger.js';
import { testGPT5Connection } from './services/gpt5/testConnection.js';
import { AgentManager } from './agents/index.js';
import lambdaRoutes from './routes/lambda.routes.js';
import scriptsRoutes from './routes/scripts.routes.js';
import webhooksRoutes from './routes/webhooks.routes.js';

// Load environment variables
dotenv.config();

const app = express();
const httpServer = createServer(app);

// Allow multiple origins for CORS
const allowedOrigins = ['http://localhost:3000', 'http://localhost:3002'];

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Initialize Agent Manager
const agentManager = new AgentManager(io);

// Middleware
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'vsl-backend',
    version: '1.0.0',
  });
});

// API routes
app.get('/api/test-gpt5', async (req, res) => {
  try {
    const result = await testGPT5Connection();
    res.json({
      success: result.success,
      message: result.message,
      model: result.model,
      response: result.response,
    });
  } catch (error: any) {
    logger.error('GPT-5 test failed:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Novela API routes
app.get('/api/novelas', async (req, res) => {
  try {
    const { prisma } = await import('./config/database.js');
    const novelas = await prisma.novela.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json({
      success: true,
      message: 'Novelas retrieved successfully',
      data: novelas,
    });
  } catch (error: any) {
    logger.error('Failed to get novelas:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

app.get('/api/novelas/:id', async (req, res) => {
  try {
    const { prisma } = await import('./config/database.js');
    const novela = await prisma.novela.findUnique({
      where: { id: req.params.id },
      include: {
        videos: {
          orderBy: { sceneNumber: 'asc' },
          take: 10,
        },
      },
    });

    if (!novela) {
      return res.status(404).json({
        success: false,
        message: 'Novela not found',
      });
    }

    res.json({
      success: true,
      message: 'Novela retrieved successfully',
      data: novela,
    });
  } catch (error: any) {
    logger.error('Failed to get novela:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Agent API routes
app.post('/api/agents/test-script', async (req, res) => {
  try {
    const result = await agentManager.generateScript({
      novelaId: 'test-novela-1',
      sceneNumber: 1,
      plotPoints: ['Meeting at the coffee shop', 'First romantic tension'],
      characterDescriptions: {
        Maria: 'Beautiful 30-year-old woman, elegant dress, confident',
        João: 'Handsome 35-year-old man, business suit, mysterious',
      },
      tone: 'Romantic drama with subtle tension',
      duration: 8,
    });

    res.json(result);
  } catch (error: any) {
    logger.error('Agent test failed:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

app.post('/api/agents/generate-script', async (req, res) => {
  try {
    const { novelaId, sceneNumber, sceneContext, duration } = req.body;

    if (!novelaId || !sceneNumber) {
      return res.status(400).json({
        success: false,
        message: 'novelaId and sceneNumber are required',
      });
    }

    // Get novela details
    const { prisma } = await import('./config/database.js');
    const novela = await prisma.novela.findUnique({
      where: { id: novelaId },
    });

    if (!novela) {
      return res.status(404).json({
        success: false,
        message: 'Novela not found',
      });
    }

    // Build plot points from scene context
    const plotPoints = sceneContext
      ? [sceneContext]
      : [`Scene ${sceneNumber} of ${novela.title}`];

    // Get character descriptions from novela
    const characterDescriptions =
      novela.referenceCharacterImages || {};

    const result = await agentManager.generateScript({
      novelaId,
      sceneNumber,
      plotPoints,
      characterDescriptions,
      tone: `${novela.genre || 'Drama'} with emotional depth`,
      duration: duration || novela.defaultDuration || 8,
    });

    res.json(result);
  } catch (error: any) {
    logger.error('Script generation failed:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

app.get('/api/agents/stats', (req, res) => {
  try {
    const stats = agentManager.getStats();
    res.json(stats);
  } catch (error: any) {
    logger.error('Failed to get agent stats:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

app.get('/api/agents/messages', async (req, res) => {
  try {
    const { novelaId } = req.query;
    const { prisma } = await import('./config/database.js');

    const messages = await prisma.agentMessage.findMany({
      where: novelaId ? { novelaId: novelaId as string } : {},
      orderBy: { timestamp: 'desc' },
      take: 50,
    });

    res.json({
      success: true,
      message: 'Agent messages retrieved successfully',
      data: messages,
    });
  } catch (error: any) {
    logger.error('Failed to get agent messages:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// ============================================================================
// VSL (VIDEO SALES LETTER) API ROUTES
// ============================================================================

// Get all VSL projects
app.get('/api/vsl/projects', async (req, res) => {
  try {
    const { userId } = req.query;
    const { prisma } = await import('./config/database.js');

    const projects = await prisma.vSLProject.findMany({
      where: userId ? { userId: userId as string } : {},
      include: {
        _count: {
          select: { sections: true, videos: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      message: 'VSL projects retrieved successfully',
      data: projects,
    });
  } catch (error: any) {
    logger.error('Failed to get VSL projects:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Create new VSL project
app.post('/api/vsl/projects', async (req, res) => {
  try {
    const {
      userId,
      projectName,
      templateId,
      productService,
      targetAudience,
      mainProblem,
      priceOffer,
      tone,
    } = req.body;

    if (!projectName || !templateId) {
      return res.status(400).json({
        success: false,
        message: 'projectName and templateId are required',
      });
    }

    // Validate templateId
    const validTemplates = ['pas', 'aida', 'story', 'authority'];
    if (!validTemplates.includes(templateId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid templateId. Must be one of: pas, aida, story, authority',
      });
    }

    const { prisma } = await import('./config/database.js');

    // Get sections for this template
    const templateSections: Record<string, string[]> = {
      pas: ['Problem', 'Agitate', 'Solution'],
      aida: ['Attention', 'Interest', 'Desire', 'Action'],
      story: ['Story', 'Journey', 'Transform', 'Offer'],
      authority: ['Credentials', 'Cases', 'Proof', 'Offer'],
    };

    const sections = templateSections[templateId];

    const project = await prisma.vSLProject.create({
      data: {
        userId,
        projectName,
        templateId,
        productService,
        targetAudience,
        mainProblem,
        priceOffer,
        tone: tone || 'professional',
        totalSections: sections.length,
        sections: {
          create: sections.map((name, index) => ({
            sectionName: name,
            sectionOrder: index,
            content: '',
          })),
        },
      },
      include: {
        sections: {
          orderBy: { sectionOrder: 'asc' },
        },
      },
    });

    res.json({
      success: true,
      message: 'VSL project created successfully',
      data: project,
    });
  } catch (error: any) {
    logger.error('Failed to create VSL project:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Get single VSL project
app.get('/api/vsl/projects/:id', async (req, res) => {
  try {
    const { prisma } = await import('./config/database.js');

    const project = await prisma.vSLProject.findUnique({
      where: { id: req.params.id },
      include: {
        sections: {
          orderBy: { sectionOrder: 'asc' },
        },
        videos: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'VSL project not found',
      });
    }

    res.json({
      success: true,
      message: 'VSL project retrieved successfully',
      data: project,
    });
  } catch (error: any) {
    logger.error('Failed to get VSL project:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Update VSL project
app.put('/api/vsl/projects/:id', async (req, res) => {
  try {
    const {
      projectName,
      productService,
      targetAudience,
      mainProblem,
      priceOffer,
      tone,
      status,
    } = req.body;

    const { prisma } = await import('./config/database.js');

    const project = await prisma.vSLProject.update({
      where: { id: req.params.id },
      data: {
        ...(projectName && { projectName }),
        ...(productService !== undefined && { productService }),
        ...(targetAudience !== undefined && { targetAudience }),
        ...(mainProblem !== undefined && { mainProblem }),
        ...(priceOffer !== undefined && { priceOffer }),
        ...(tone && { tone }),
        ...(status && { status }),
      },
      include: {
        sections: {
          orderBy: { sectionOrder: 'asc' },
        },
      },
    });

    res.json({
      success: true,
      message: 'VSL project updated successfully',
      data: project,
    });
  } catch (error: any) {
    logger.error('Failed to update VSL project:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Get sections for a project
app.get('/api/vsl/projects/:id/sections', async (req, res) => {
  try {
    const { prisma } = await import('./config/database.js');

    const sections = await prisma.vSLSection.findMany({
      where: { projectId: req.params.id },
      orderBy: { sectionOrder: 'asc' },
      include: {
        _count: {
          select: { scripts: true },
        },
      },
    });

    res.json({
      success: true,
      message: 'Project sections retrieved successfully',
      data: sections,
    });
  } catch (error: any) {
    logger.error('Failed to get project sections:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Get single VSL section
app.get('/api/vsl/sections/:id', async (req, res) => {
  try {
    const { prisma } = await import('./config/database.js');

    const section = await prisma.vSLSection.findUnique({
      where: { id: req.params.id },
      include: {
        project: true,
        detailedScript: {
          include: {
            videos: {
              orderBy: { videoOrder: 'asc' },
            },
          },
        },
      },
    });

    if (!section) {
      return res.status(404).json({
        success: false,
        message: 'Section not found',
      });
    }

    res.json({
      success: true,
      message: 'VSL section retrieved successfully',
      data: section,
    });
  } catch (error: any) {
    logger.error('Failed to get VSL section:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Update VSL section
app.put('/api/vsl/sections/:id', async (req, res) => {
  try {
    const { content } = req.body;

    if (content === undefined) {
      return res.status(400).json({
        success: false,
        message: 'content is required',
      });
    }

    const { prisma } = await import('./config/database.js');

    const section = await prisma.vSLSection.update({
      where: { id: req.params.id },
      data: {
        content,
        wordCount: content.trim().split(/\s+/).length,
        characterCount: content.length,
        estimatedDuration: Math.ceil(content.trim().split(/\s+/).length / 2), // ~2 words per second
      },
    });

    res.json({
      success: true,
      message: 'VSL section updated successfully',
      data: section,
    });
  } catch (error: any) {
    logger.error('Failed to update VSL section:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Generate VSL section content with AI
app.post('/api/vsl/sections/:id/generate', async (req, res) => {
  try {
    const { prisma } = await import('./config/database.js');

    const section = await prisma.vSLSection.findUnique({
      where: { id: req.params.id },
      include: {
        project: true,
      },
    });

    if (!section) {
      return res.status(404).json({
        success: false,
        message: 'Section not found',
      });
    }

    // Call VSL Specialist Agent to generate content
    const result = await agentManager.generateVSLContent({
      projectId: section.projectId,
      templateId: section.project.templateId as any,
      sectionName: section.sectionName,
      userContext: {
        productService: section.project.productService || undefined,
        targetAudience: section.project.targetAudience || undefined,
        mainProblem: section.project.mainProblem || undefined,
        priceOffer: section.project.priceOffer || undefined,
        tone: section.project.tone,
      },
      requestType: 'generate',
    });

    if (!result.success || !result.data?.sectionContent) {
      return res.status(500).json({
        success: false,
        message: result.message || 'Failed to generate content',
      });
    }

    // Update section with AI-generated content
    const updatedSection = await prisma.vSLSection.update({
      where: { id: req.params.id },
      data: {
        content: result.data.sectionContent.content,
        persuasionScore: result.data.sectionContent.persuasionScore,
        hooks: result.data.sectionContent.hooks,
        strengths: result.data.persuasionAnalysis?.strengths || [],
        weaknesses: result.data.persuasionAnalysis?.weaknesses || [],
        improvements: result.data.sectionContent.improvements,
        wordCount: result.data.sectionContent.content.trim().split(/\s+/).length,
        characterCount: result.data.sectionContent.content.length,
        estimatedDuration: Math.ceil(result.data.sectionContent.content.trim().split(/\s+/).length / 2),
      },
    });

    res.json({
      success: true,
      message: 'Content generated successfully',
      data: updatedSection,
    });
  } catch (error: any) {
    logger.error('Failed to generate VSL content:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Improve existing VSL section content
app.post('/api/vsl/sections/:id/improve', async (req, res) => {
  try {
    const { prisma } = await import('./config/database.js');

    const section = await prisma.vSLSection.findUnique({
      where: { id: req.params.id },
      include: {
        project: true,
      },
    });

    if (!section) {
      return res.status(404).json({
        success: false,
        message: 'Section not found',
      });
    }

    if (!section.content || section.content.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Section has no content to improve',
      });
    }

    // Call VSL Specialist Agent to improve content
    const result = await agentManager.generateVSLContent({
      projectId: section.projectId,
      templateId: section.project.templateId as any,
      sectionName: section.sectionName,
      userContext: {
        productService: section.project.productService || undefined,
        targetAudience: section.project.targetAudience || undefined,
        mainProblem: section.project.mainProblem || undefined,
        priceOffer: section.project.priceOffer || undefined,
        tone: section.project.tone,
      },
      currentContent: section.content,
      requestType: 'improve',
    });

    if (!result.success || !result.data?.sectionContent) {
      return res.status(500).json({
        success: false,
        message: result.message || 'Failed to improve content',
      });
    }

    // Update section with improved content
    const updatedSection = await prisma.vSLSection.update({
      where: { id: req.params.id },
      data: {
        content: result.data.sectionContent.content,
        persuasionScore: result.data.sectionContent.persuasionScore,
        aiSuggestion: result.data.aiSuggestion,
        improvements: result.data.sectionContent.improvements,
        wordCount: result.data.sectionContent.content.trim().split(/\s+/).length,
        characterCount: result.data.sectionContent.content.length,
        estimatedDuration: Math.ceil(result.data.sectionContent.content.trim().split(/\s+/).length / 2),
      },
    });

    res.json({
      success: true,
      message: 'Content improved successfully',
      data: updatedSection,
    });
  } catch (error: any) {
    logger.error('Failed to improve VSL content:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Score VSL section content
app.post('/api/vsl/sections/:id/score', async (req, res) => {
  try {
    const { prisma } = await import('./config/database.js');

    const section = await prisma.vSLSection.findUnique({
      where: { id: req.params.id },
      include: {
        project: true,
      },
    });

    if (!section) {
      return res.status(404).json({
        success: false,
        message: 'Section not found',
      });
    }

    if (!section.content || section.content.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Section has no content to score',
      });
    }

    // Call VSL Specialist Agent to score content
    const result = await agentManager.generateVSLContent({
      projectId: section.projectId,
      templateId: section.project.templateId as any,
      sectionName: section.sectionName,
      userContext: {
        productService: section.project.productService || undefined,
        targetAudience: section.project.targetAudience || undefined,
        mainProblem: section.project.mainProblem || undefined,
        priceOffer: section.project.priceOffer || undefined,
        tone: section.project.tone,
      },
      currentContent: section.content,
      requestType: 'score',
    });

    if (!result.success || !result.data?.persuasionAnalysis) {
      return res.status(500).json({
        success: false,
        message: result.message || 'Failed to score content',
      });
    }

    // Update section with score
    const updatedSection = await prisma.vSLSection.update({
      where: { id: req.params.id },
      data: {
        persuasionScore: result.data.persuasionAnalysis.score,
        strengths: result.data.persuasionAnalysis.strengths,
        weaknesses: result.data.persuasionAnalysis.weaknesses,
        improvements: result.data.persuasionAnalysis.recommendations,
      },
    });

    res.json({
      success: true,
      message: 'Content scored successfully',
      data: {
        section: updatedSection,
        analysis: result.data.persuasionAnalysis,
      },
    });
  } catch (error: any) {
    logger.error('Failed to score VSL content:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// ============================================================================
// LAMBDA CONFIGURATION API ROUTES
// ============================================================================

// Use Lambda configuration routes
app.use('/api/lambda', lambdaRoutes);

// Use Section Detailed Scripts routes
app.use('/api/scripts', scriptsRoutes);
app.use('/api/section-videos', scriptsRoutes);

// Use Webhooks routes (no auth required for external services)
app.use('/api/webhooks', webhooksRoutes);

// Socket.IO connection handling
io.on('connection', (socket) => {
  logger.info(`✅ Client connected: ${socket.id}`);

  socket.on('disconnect', () => {
    logger.info(`❌ Client disconnected: ${socket.id}`);
  });

  // Test event
  socket.on('ping', () => {
    socket.emit('pong', { timestamp: new Date().toISOString() });
  });
});

// Start server
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, async () => {
  logger.info(`🚀 VSL Backend Server running on port ${PORT}`);
  logger.info(`📡 Socket.IO server ready`);
  logger.info(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);

  // Initialize Agent Manager
  try {
    await agentManager.initialize();
    logger.info('🤖 GPT-5 Multi-Agent System ready');
  } catch (error: any) {
    logger.error('❌ Failed to initialize Agent Manager:', error.message);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  agentManager.shutdown();
  httpServer.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

export { io };
