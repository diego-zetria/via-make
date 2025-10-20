/**
 * Lambda Configuration API Routes
 *
 * Endpoints for intelligent Lambda configuration management with AI suggestions.
 * Integrates with LambdaConfigAgent for parameter optimization.
 */

import { Router } from 'express';
import { logger } from '../utils/logger.js';
import { AgentManager } from '../agents/index.js';
import {
  requireAuth,
  requireConfigOwnership,
  requireJobOwnership,
} from '../middleware/auth.js';
import { validateBody } from '../middleware/validation.js';
import {
  suggestLambdaConfigSchema,
  optimizeLambdaConfigSchema,
  createLambdaConfigSchema,
  updateLambdaConfigSchema,
  createLambdaJobSchema,
} from '../validation/schemas.js';
import {
  generalLimiter,
  aiGenerationLimiter,
  lambdaJobLimiter,
  configModificationLimiter,
  statusPollingLimiter,
} from '../middleware/rateLimiter.js';

const router = Router();

// Apply authentication to all routes
router.use(requireAuth);

// Apply general rate limiter to all routes
router.use(generalLimiter);

/**
 * POST /api/lambda/suggest
 *
 * Get intelligent AI suggestions for Lambda configuration
 *
 * Body:
 * - projectId: string (required)
 * - mediaType: 'video' | 'image' | 'audio' (required)
 * - context: Object (optional)
 *   - vslScript: string
 *   - projectName: string
 *   - targetAudience: string
 *   - tone: string
 *   - budget: string ('low', 'medium', 'high', or specific value)
 *   - qualityPriority: 'cost' | 'balanced' | 'quality'
 */
router.post('/suggest', aiGenerationLimiter, validateBody(suggestLambdaConfigSchema), async (req, res) => {
  try {
    const { projectId, mediaType, context } = req.body;
    const userId = req.user?.id;

    // Validation
    if (!projectId || !mediaType) {
      return res.status(400).json({
        success: false,
        message: 'projectId and mediaType are required',
      });
    }

    const validMediaTypes = ['video', 'image', 'audio'];
    if (!validMediaTypes.includes(mediaType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid mediaType. Must be one of: video, image, audio',
      });
    }

    // Optional: Verify project ownership (disabled for development flexibility)
    // In production, uncomment this block to enforce ownership checks
    // const { prisma } = await import('../config/database.js');
    // const project = await prisma.vSLProject.findUnique({
    //   where: { id: projectId },
    //   select: { userId: true },
    // });

    // if (!project) {
    //   return res.status(404).json({
    //     success: false,
    //     message: 'Project not found',
    //   });
    // }

    // if (project.userId !== userId) {
    //   return res.status(403).json({
    //     success: false,
    //     message: 'Access denied. You do not own this project.',
    //   });
    // }

    // Import AgentManager dynamically if needed
    const agentManager = new AgentManager(null as any); // Socket.IO not needed for Lambda config
    await agentManager.initialize();

    // Call LambdaConfigAgent for intelligent suggestions
    const result = await agentManager.suggestLambdaConfig({
      projectId,
      mediaType,
      requestType: 'suggest',
      context,
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: result.message || 'Failed to generate Lambda config suggestions',
      });
    }

    res.json({
      success: true,
      message: 'Lambda configuration suggested successfully',
      data: result.data,
    });
  } catch (error: any) {
    logger.error('Lambda suggest failed:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * POST /api/lambda/optimize
 *
 * Optimize existing Lambda parameters with AI
 *
 * Body:
 * - projectId: string (required)
 * - mediaType: 'video' | 'image' | 'audio' (required)
 * - currentParams: Object (required) - Current Lambda parameters
 * - context: Object (optional) - Same as suggest endpoint
 */
router.post('/optimize', aiGenerationLimiter, validateBody(optimizeLambdaConfigSchema), async (req, res) => {
  try {
    const { projectId, mediaType, currentParams, context } = req.body;
    const userId = req.user?.id;

    // Validation
    if (!projectId || !mediaType || !currentParams) {
      return res.status(400).json({
        success: false,
        message: 'projectId, mediaType, and currentParams are required',
      });
    }

    const validMediaTypes = ['video', 'image', 'audio'];
    if (!validMediaTypes.includes(mediaType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid mediaType. Must be one of: video, image, audio',
      });
    }

    // Optional: Verify project ownership (disabled for development flexibility)
    // In production, uncomment this block to enforce ownership checks
    // const { prisma } = await import('../config/database.js');
    // const project = await prisma.vSLProject.findUnique({
    //   where: { id: projectId },
    //   select: { userId: true },
    // });

    // if (!project) {
    //   return res.status(404).json({
    //     success: false,
    //     message: 'Project not found',
    //   });
    // }

    // if (project.userId !== userId) {
    //   return res.status(403).json({
    //     success: false,
    //     message: 'Access denied. You do not own this project.',
    //   });
    // }

    const agentManager = new AgentManager(null as any);
    await agentManager.initialize();

    // Call LambdaConfigAgent for optimization
    const result = await agentManager.suggestLambdaConfig({
      projectId,
      mediaType,
      requestType: 'optimize',
      currentParams,
      context,
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: result.message || 'Failed to optimize Lambda config',
      });
    }

    res.json({
      success: true,
      message: 'Lambda configuration optimized successfully',
      data: result.data,
    });
  } catch (error: any) {
    logger.error('Lambda optimize failed:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * POST /api/lambda/configs
 *
 * Save a new Lambda configuration
 *
 * Body:
 * - name: string (required)
 * - description: string (optional)
 * - lambdaName: string (required) - e.g., 'generate-media'
 * - lambdaUrl: string (required)
 * - mediaType: 'video' | 'image' | 'audio' (required)
 * - modelId: string (required)
 * - defaultParams: Object (required)
 * - userId: string (optional)
 * - projectId: string (optional) - Link to VSL project
 * - isDefault: boolean (optional)
 */
router.post('/configs', configModificationLimiter, validateBody(createLambdaConfigSchema), async (req, res) => {
  try {
    const {
      name,
      description,
      lambdaName,
      lambdaUrl,
      mediaType,
      modelId,
      defaultParams,
      suggestedParams,
      suggestionMeta,
      userId,
      projectId,
      isDefault,
    } = req.body;
    const authenticatedUserId = req.user?.id;

    // Validation
    if (!name || !lambdaName || !lambdaUrl || !mediaType || !modelId || !defaultParams) {
      return res.status(400).json({
        success: false,
        message: 'Required fields: name, lambdaName, lambdaUrl, mediaType, modelId, defaultParams',
      });
    }

    // Optional: If userId provided, must match authenticated user (disabled for development)
    // In production, uncomment this block to enforce user verification
    // if (userId && userId !== authenticatedUserId) {
    //   return res.status(403).json({
    //     success: false,
    //     message: 'Access denied. You can only create configs for yourself.',
    //   });
    // }

    const { prisma } = await import('../config/database.js');

    // Optional: If projectId provided, verify ownership (disabled for development)
    // In production, uncomment this block to enforce ownership checks
    // if (projectId) {
    //   const project = await prisma.vSLProject.findUnique({
    //     where: { id: projectId },
    //     select: { userId: true },
    //   });

    //   if (!project) {
    //     return res.status(404).json({
    //       success: false,
    //       message: 'Project not found',
    //     });
    //   }

    //   if (project.userId !== authenticatedUserId) {
    //     return res.status(403).json({
    //       success: false,
    //       message: 'Access denied. You do not own this project.',
    //     });
    //   }
    // }

    // If marking as default, unset other defaults for this media type and project
    if (isDefault) {
      await prisma.lambdaConfig.updateMany({
        where: {
          mediaType,
          isDefault: true,
          ...(userId && { userId }),
          ...(projectId && { projectId }),
        },
        data: {
          isDefault: false,
        },
      });
    }

    logger.info('Creating Lambda config with data:', {
      userId,
      projectId,
      name,
      description,
      lambdaName,
      lambdaUrl,
      mediaType,
      modelId,
      hasDefaultParams: !!defaultParams,
      hasSuggestedParams: !!suggestedParams,
      hasSuggestionMeta: !!suggestionMeta,
      isDefault,
    });

    const config = await prisma.lambdaConfig.create({
      data: {
        userId,
        projectId,
        name,
        description,
        lambdaName,
        lambdaUrl,
        mediaType,
        modelId,
        defaultParams,
        ...(suggestedParams && { suggestedParams }),
        ...(suggestionMeta && { suggestionMeta }),
        isDefault: isDefault || false,
      },
    });

    res.json({
      success: true,
      message: 'Lambda configuration saved successfully',
      data: config,
    });
  } catch (error: any) {
    logger.error('Failed to save Lambda config:', {
      error: error.message,
      stack: error.stack,
      code: error.code,
    });
    res.status(500).json({
      success: false,
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

/**
 * GET /api/lambda/configs
 *
 * List all Lambda configurations
 *
 * Query:
 * - projectId: string (optional) - Filter by project
 * - mediaType: string (optional) - Filter by media type
 * - isActive: boolean (optional) - Filter by active status
 */
router.get('/configs', async (req, res) => {
  try {
    const { projectId, mediaType, isActive } = req.query;
    const userId = req.user?.id;
    const { prisma } = await import('../config/database.js');

    // Optional: If projectId provided, verify ownership (disabled for development)
    // In production, uncomment this block to enforce ownership checks
    // if (projectId) {
    //   const project = await prisma.vSLProject.findUnique({
    //     where: { id: projectId as string },
    //     select: { userId: true },
    //   });

    //   if (!project) {
    //     return res.status(404).json({
    //       success: false,
    //       message: 'Project not found',
    //     });
    //   }

    //   if (project.userId !== userId) {
    //     return res.status(403).json({
    //       success: false,
    //       message: 'Access denied. You do not own this project.',
    //     });
    //   }
    // }

    const configs = await prisma.lambdaConfig.findMany({
      where: {
        // Only return configs owned by user OR global configs (no userId)
        OR: [
          { userId: userId },
          { userId: null },
        ],
        ...(projectId && { projectId: projectId as string }),
        ...(mediaType && { mediaType: mediaType as string }),
        ...(isActive !== undefined && { isActive: isActive === 'true' }),
      },
      include: {
        _count: {
          select: { jobs: true },
        },
      },
      orderBy: [
        { isDefault: 'desc' },
        { useCount: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    res.json({
      success: true,
      message: 'Lambda configurations retrieved successfully',
      data: configs,
    });
  } catch (error: any) {
    logger.error('Failed to get Lambda configs:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * GET /api/lambda/configs/:id
 *
 * Get a specific Lambda configuration
 */
router.get('/configs/:id', requireConfigOwnership, async (req, res) => {
  try {
    const { prisma } = await import('../config/database.js');

    const config = await prisma.lambdaConfig.findUnique({
      where: { id: req.params.id },
      include: {
        jobs: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Lambda configuration not found',
      });
    }

    res.json({
      success: true,
      message: 'Lambda configuration retrieved successfully',
      data: config,
    });
  } catch (error: any) {
    logger.error('Failed to get Lambda config:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * PUT /api/lambda/configs/:id
 *
 * Update a Lambda configuration
 *
 * Body: Same fields as POST /configs (all optional except those being updated)
 */
router.put('/configs/:id', configModificationLimiter, requireConfigOwnership, validateBody(updateLambdaConfigSchema), async (req, res) => {
  try {
    const {
      name,
      description,
      lambdaName,
      lambdaUrl,
      mediaType,
      modelId,
      defaultParams,
      suggestedParams,
      suggestionMeta,
      isActive,
      isDefault,
    } = req.body;

    const { prisma } = await import('../config/database.js');

    // If marking as default, unset other defaults
    if (isDefault) {
      const existingConfig = await prisma.lambdaConfig.findUnique({
        where: { id: req.params.id },
      });

      if (existingConfig) {
        await prisma.lambdaConfig.updateMany({
          where: {
            mediaType: existingConfig.mediaType,
            isDefault: true,
            id: { not: req.params.id },
          },
          data: {
            isDefault: false,
          },
        });
      }
    }

    const config = await prisma.lambdaConfig.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(lambdaName && { lambdaName }),
        ...(lambdaUrl && { lambdaUrl }),
        ...(mediaType && { mediaType }),
        ...(modelId && { modelId }),
        ...(defaultParams && { defaultParams }),
        ...(suggestedParams !== undefined && { suggestedParams }),
        ...(suggestionMeta !== undefined && { suggestionMeta }),
        ...(isActive !== undefined && { isActive }),
        ...(isDefault !== undefined && { isDefault }),
      },
    });

    res.json({
      success: true,
      message: 'Lambda configuration updated successfully',
      data: config,
    });
  } catch (error: any) {
    logger.error('Failed to update Lambda config:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * DELETE /api/lambda/configs/:id
 *
 * Delete a Lambda configuration
 */
router.delete('/configs/:id', configModificationLimiter, requireConfigOwnership, async (req, res) => {
  try {
    const { prisma } = await import('../config/database.js');

    await prisma.lambdaConfig.delete({
      where: { id: req.params.id },
    });

    res.json({
      success: true,
      message: 'Lambda configuration deleted successfully',
    });
  } catch (error: any) {
    logger.error('Failed to delete Lambda config:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * POST /api/lambda/jobs
 *
 * Create a new Lambda job
 *
 * Body:
 * - configId: string (optional) - Use saved config
 * - userId: string (optional)
 * - projectId: string (optional)
 * - lambdaName: string (required)
 * - mediaType: 'video' | 'image' | 'audio' (required)
 * - modelId: string (required)
 * - prompt: string (required)
 * - parameters: Object (required)
 */
router.post('/jobs', lambdaJobLimiter, validateBody(createLambdaJobSchema), async (req, res) => {
  try {
    const {
      configId,
      userId,
      projectId,
      lambdaName,
      mediaType,
      modelId,
      prompt,
      parameters,
    } = req.body;
    const authenticatedUserId = req.user?.id;

    // Validation
    if (!lambdaName || !mediaType || !modelId || !prompt || !parameters) {
      return res.status(400).json({
        success: false,
        message: 'Required fields: lambdaName, mediaType, modelId, prompt, parameters',
      });
    }

    // If userId provided, must match authenticated user
    if (userId && userId !== authenticatedUserId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only create jobs for yourself.',
      });
    }

    const { prisma } = await import('../config/database.js');

    // If projectId provided, verify ownership
    if (projectId) {
      const project = await prisma.vSLProject.findUnique({
        where: { id: projectId },
        select: { userId: true },
      });

      if (!project) {
        return res.status(404).json({
          success: false,
          message: 'Project not found',
        });
      }

      if (project.userId !== authenticatedUserId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You do not own this project.',
        });
      }
    }

    // If configId provided, verify ownership
    if (configId) {
      const config = await prisma.lambdaConfig.findUnique({
        where: { id: configId },
        select: { userId: true },
      });

      if (!config) {
        return res.status(404).json({
          success: false,
          message: 'Lambda configuration not found',
        });
      }

      if (config.userId && config.userId !== authenticatedUserId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You do not own this configuration.',
        });
      }
    }

    // Generate UUID for job
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Estimate cost and time based on model and parameters
    // This is a simplified version - in production, load from models.json
    let estimatedCost = 0.10;
    let estimatedTime = 30;

    if (mediaType === 'video') {
      const duration = parameters.duration || 8;
      estimatedCost = duration * 0.10; // $0.10 per second (simplified)
      estimatedTime = duration * 5; // 5 seconds processing per second of video
    }

    // Create job in database
    const job = await prisma.lambdaJob.create({
      data: {
        configId,
        userId,
        projectId,
        jobId,
        lambdaName,
        mediaType,
        modelId,
        prompt,
        parameters,
        estimatedCost,
        estimatedTime,
      },
    });

    // Update config usage count if configId provided
    if (configId) {
      await prisma.lambdaConfig.update({
        where: { id: configId },
        data: {
          useCount: { increment: 1 },
          lastUsedAt: new Date(),
        },
      });
    }

    // ⚠️ CALL AWS LAMBDA TO START ACTUAL PROCESSING
    try {
      const lambdaUrl = `${process.env.LAMBDA_API_BASE_URL}/generate-media`;

      logger.info(`🚀 Calling Lambda: ${lambdaUrl}`, {
        jobId,
        mediaType,
        modelId,
      });

      // Construct webhook URL for Replicate callbacks
      const webhookUrl = `${process.env.BACKEND_BASE_URL}/api/webhooks/replicate`;

      const lambdaResponse = await fetch(lambdaUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: userId || 'anonymous',
          mediaType,
          modelId,
          parameters,
          webhook_url: webhookUrl, // Replicate will POST to this URL when done
        }),
      });

      logger.info(`📡 Webhook configured: ${webhookUrl}`);

      const lambdaResult = await lambdaResponse.json();

      if (lambdaResponse.ok && lambdaResult.success) {
        // Update job with Replicate job ID
        await prisma.lambdaJob.update({
          where: { id: job.id },
          data: {
            replicateJobId: lambdaResult.replicateJobId,
            status: 'processing',
          },
        });

        logger.info(`✅ Lambda called successfully`, {
          jobId,
          replicateJobId: lambdaResult.replicateJobId,
        });

        res.json({
          success: true,
          message: 'Lambda job created and processing started',
          data: {
            ...job,
            replicateJobId: lambdaResult.replicateJobId,
            status: 'processing',
          },
        });
      } else {
        // Lambda call failed
        logger.error('❌ Lambda call failed', {
          status: lambdaResponse.status,
          error: lambdaResult,
        });

        await prisma.lambdaJob.update({
          where: { id: job.id },
          data: {
            status: 'failed',
            error: lambdaResult.message || 'Lambda call failed',
          },
        });

        res.status(500).json({
          success: false,
          message: `Lambda call failed: ${lambdaResult.message || 'Unknown error'}`,
          data: job,
        });
      }
    } catch (lambdaError: any) {
      logger.error('❌ Error calling Lambda', {
        error: lambdaError.message,
        jobId,
      });

      await prisma.lambdaJob.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          error: `Lambda error: ${lambdaError.message}`,
        },
      });

      res.status(500).json({
        success: false,
        message: `Failed to call Lambda: ${lambdaError.message}`,
        data: job,
      });
    }
  } catch (error: any) {
    logger.error('Failed to create Lambda job:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * GET /api/lambda/jobs/:jobId
 *
 * Get Lambda job status and results
 */
router.get('/jobs/:jobId', statusPollingLimiter, requireJobOwnership, async (req, res) => {
  try {
    const { prisma } = await import('../config/database.js');

    const job = await prisma.lambdaJob.findUnique({
      where: { jobId: req.params.jobId },
      include: {
        config: true,
      },
    });

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Lambda job not found',
      });
    }

    res.json({
      success: true,
      message: 'Lambda job retrieved successfully',
      data: job,
    });
  } catch (error: any) {
    logger.error('Failed to get Lambda job:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * GET /api/lambda/jobs
 *
 * List Lambda jobs
 *
 * Query:
 * - projectId: string (optional)
 * - status: string (optional)
 * - mediaType: string (optional)
 * - limit: number (optional, default: 50)
 */
router.get('/jobs', async (req, res) => {
  try {
    const { projectId, status, mediaType, limit } = req.query;
    const userId = req.user?.id;
    const { prisma } = await import('../config/database.js');

    // If projectId provided, verify ownership
    if (projectId) {
      const project = await prisma.vSLProject.findUnique({
        where: { id: projectId as string },
        select: { userId: true },
      });

      if (!project) {
        return res.status(404).json({
          success: false,
          message: 'Project not found',
        });
      }

      if (project.userId !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You do not own this project.',
        });
      }
    }

    const jobs = await prisma.lambdaJob.findMany({
      where: {
        // Only return jobs owned by user OR anonymous jobs (no userId)
        OR: [
          { userId: userId },
          { userId: null },
        ],
        ...(projectId && { projectId: projectId as string }),
        ...(status && { status: status as string }),
        ...(mediaType && { mediaType: mediaType as string }),
      },
      include: {
        config: {
          select: {
            id: true,
            name: true,
            modelId: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit ? parseInt(limit as string) : 50,
    });

    res.json({
      success: true,
      message: 'Lambda jobs retrieved successfully',
      data: jobs,
    });
  } catch (error: any) {
    logger.error('Failed to get Lambda jobs:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * GET /api/lambda/models
 *
 * Get available AI models configuration
 */
router.get('/models', async (req, res) => {
  try {
    const { mediaType } = req.query;

    // Load models.json
    const fs = await import('fs');
    const path = await import('path');
    const modelsPath = path.join(process.cwd(), '..', 'config', 'models.json');
    const modelsData = JSON.parse(fs.readFileSync(modelsPath, 'utf-8'));

    // Filter by media type if provided
    const filteredModels = mediaType
      ? { [mediaType as string]: modelsData[mediaType as string] }
      : modelsData;

    res.json({
      success: true,
      message: 'AI models retrieved successfully',
      data: filteredModels,
    });
  } catch (error: any) {
    logger.error('Failed to get AI models:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

export default router;
