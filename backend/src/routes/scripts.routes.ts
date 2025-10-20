/**
 * Section Detailed Scripts API Routes
 *
 * Endpoints for managing detailed multi-video scripts for VSL sections.
 * Integrates with ScriptDetailAgent GPT-5 for intelligent script generation.
 */

import { Router } from 'express';
import { logger } from '../utils/logger.js';
import { prisma } from '../config/database.js';
import { AgentManager } from '../agents/index.js';
import { v4 as uuidv4 } from 'uuid';
import {
  requireAuth,
  requireSectionOwnership,
  requireScriptOwnership,
  requireVideoOwnership,
} from '../middleware/auth.js';
import { validateBody } from '../middleware/validation.js';
import {
  generateDetailedScriptSchema,
  generateVideoSchema,
  regenerateVideoSchema,
  compileScriptSchema,
} from '../validation/schemas.js';
import {
  generalLimiter,
  aiGenerationLimiter,
  videoGenerationLimiter,
  statusPollingLimiter,
} from '../middleware/rateLimiter.js';

const router = Router();

// Apply authentication to all routes
router.use(requireAuth);

// Apply general rate limiter to all routes
router.use(generalLimiter);

/**
 * POST /api/scripts/generate-detailed
 *
 * Generate detailed multi-video script for a VSL section using GPT-5
 *
 * Body:
 * - projectId: string (required)
 * - sectionId: string (required)
 * - totalDuration: number (required) - Total duration in seconds
 * - language: 'pt-br' | 'en' | 'es' | 'it' | 'fr' | 'de' (required)
 * - modelId: string (required) - To calculate video count
 */
router.post('/generate-detailed', aiGenerationLimiter, validateBody(generateDetailedScriptSchema), async (req, res) => {
  try {
    const { projectId, sectionId, totalDuration, language, modelId } = req.body;

    // Check if section exists
    const section = await prisma.vSLSection.findUnique({
      where: { id: sectionId },
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

    if (section.projectId !== projectId) {
      return res.status(400).json({
        success: false,
        message: 'Section does not belong to this project',
      });
    }

    // ✅ SECURITY: Verify user owns this project (DISABLED FOR DEVELOPMENT)
    // Re-enable for production:
    // if (section.project.userId !== req.user?.id) {
    //   return res.status(403).json({
    //     success: false,
    //     message: 'Access denied. You do not own this project.',
    //   });
    // }

    // Initialize AgentManager
    const agentManager = new AgentManager(null as any);
    await agentManager.initialize();

    // Call ScriptDetailAgent for detailed script generation
    const result = await agentManager.generateDetailedScript({
      projectId,
      sectionId,
      sectionContent: section.content,
      totalDuration,
      language,
      modelId,
      productContext: {
        productName: section.project.projectName,
        productService: section.project.productService || undefined,
        targetAudience: section.project.targetAudience || undefined,
        tone: section.project.tone,
      },
    });

    if (!result.success || !result.detailedScript) {
      return res.status(500).json({
        success: false,
        message: result.message || 'Failed to generate detailed script',
      });
    }

    const detailedScript = result.detailedScript;

    // Check if script already exists for this section
    const existingScript = await prisma.sectionDetailedScript.findUnique({
      where: { sectionId },
      include: { videos: true },
    });

    // Delete existing script and videos if present
    if (existingScript) {
      logger.info(`🗑️ Deleting existing script ${existingScript.id} with ${existingScript.videos.length} videos`);

      // Delete videos first (foreign key constraint)
      await prisma.sectionVideo.deleteMany({
        where: { scriptId: existingScript.id },
      });

      // Delete script
      await prisma.sectionDetailedScript.delete({
        where: { id: existingScript.id },
      });
    }

    // Create new SectionDetailedScript record
    const scriptRecord = await prisma.sectionDetailedScript.create({
      data: {
        projectId,
        sectionId,
        language: detailedScript.language,
        totalDuration: detailedScript.totalDuration,
        videoCount: detailedScript.videoCount,
        aiGenerated: true,
        generatedBy: 'script_detail_agent',
      },
    });

    // Generate base seed for visual continuity
    const baseSeed = Math.floor(Math.random() * 1000000);

    // Create SectionVideo records with incremental seeds
    const videoRecords = await Promise.all(
      detailedScript.videos.map((video, index) =>
        prisma.sectionVideo.create({
          data: {
            scriptId: scriptRecord.id,
            videoOrder: video.videoOrder,
            startTime: video.startTime,
            endTime: video.endTime,
            duration: video.duration,
            partName: video.partName,
            step: video.step,
            objective: video.objective,
            voice: video.voice,
            example: video.example,
            visual: video.visual,
            modelId,
            seed: baseSeed + index, // Incremental seed for continuity
            generationParams: {
              optimizedPrompt: video.optimizedPrompt,
            },
            status: 'pending',
          },
        })
      )
    );

    logger.info(`✅ Detailed script generated: ${scriptRecord.id} with ${videoRecords.length} videos`);

    res.json({
      success: true,
      message: 'Detailed script generated successfully',
      data: {
        scriptId: scriptRecord.id,
        language: scriptRecord.language,
        totalDuration: scriptRecord.totalDuration,
        videoCount: scriptRecord.videoCount,
        videos: videoRecords.map((v) => ({
          id: v.id,
          videoOrder: v.videoOrder,
          startTime: v.startTime,
          endTime: v.endTime,
          duration: v.duration,
          partName: v.partName,
          step: v.step,
          objective: v.objective,
          voice: v.voice,
          example: v.example,
          visual: v.visual,
          status: v.status,
        })),
        reasoning: detailedScript.reasoning,
      },
    });
  } catch (error: any) {
    logger.error('❌ Error generating detailed script:', error.message);
    res.status(500).json({
      success: false,
      message: `Failed to generate detailed script: ${error.message}`,
    });
  }
});

/**
 * GET /api/scripts/:scriptId
 *
 * Get detailed script with all videos
 */
// ✅ SECURITY: requireScriptOwnership DISABLED FOR DEVELOPMENT
// Re-enable for production by uncommenting requireScriptOwnership middleware
router.get('/:scriptId', /* requireScriptOwnership, */ async (req, res) => {
  try {
    const { scriptId } = req.params;

    const script = await prisma.sectionDetailedScript.findUnique({
      where: { id: scriptId },
      include: {
        videos: {
          orderBy: { videoOrder: 'asc' },
        },
        section: true,
        project: true,
      },
    });

    if (!script) {
      return res.status(404).json({
        success: false,
        message: 'Script not found',
      });
    }

    res.json({
      success: true,
      data: script,
    });
  } catch (error: any) {
    logger.error('❌ Error fetching script:', error.message);
    res.status(500).json({
      success: false,
      message: `Failed to fetch script: ${error.message}`,
    });
  }
});

/**
 * PUT /api/scripts/:scriptId
 *
 * Update detailed script metadata
 *
 * Body:
 * - language: string (optional)
 * - totalDuration: number (optional)
 */
router.put('/:scriptId', async (req, res) => {
  try {
    const { scriptId } = req.params;
    const { language, totalDuration } = req.body;

    const script = await prisma.sectionDetailedScript.findUnique({
      where: { id: scriptId },
    });

    if (!script) {
      return res.status(404).json({
        success: false,
        message: 'Script not found',
      });
    }

    const updateData: any = {};
    if (language) updateData.language = language;
    if (totalDuration) updateData.totalDuration = totalDuration;

    const updatedScript = await prisma.sectionDetailedScript.update({
      where: { id: scriptId },
      data: updateData,
    });

    logger.info(`✅ Script updated: ${scriptId}`);

    res.json({
      success: true,
      message: 'Script updated successfully',
      data: updatedScript,
    });
  } catch (error: any) {
    logger.error('❌ Error updating script:', error.message);
    res.status(500).json({
      success: false,
      message: `Failed to update script: ${error.message}`,
    });
  }
});

/**
 * POST /api/section-videos/:videoId/generate
 *
 * Generate a single video from SectionVideo record
 *
 * Body:
 * - lambdaConfigId: string (optional) - Lambda config to use
 */
// ✅ SECURITY: requireVideoOwnership DISABLED FOR DEVELOPMENT
// Re-enable for production by uncommenting requireVideoOwnership middleware
router.post('/:videoId/generate', videoGenerationLimiter, /* requireVideoOwnership, */ validateBody(generateVideoSchema), async (req, res) => {
  try {
    const { videoId } = req.params;
    const { lambdaConfigId } = req.body;

    // Get video record
    const video = await prisma.sectionVideo.findUnique({
      where: { id: videoId },
      include: {
        script: {
          include: {
            project: true,
          },
        },
      },
    });

    if (!video) {
      return res.status(404).json({
        success: false,
        message: 'Video not found',
      });
    }

    // Check if video is pending or failed (can regenerate)
    if (video.status !== 'pending' && video.status !== 'failed') {
      return res.status(400).json({
        success: false,
        message: `Video status is ${video.status}. Can only generate pending or failed videos.`,
      });
    }

    // Get Lambda config (use provided or default for video)
    let lambdaConfig;
    if (lambdaConfigId) {
      lambdaConfig = await prisma.lambdaConfig.findUnique({
        where: { id: lambdaConfigId },
      });
    } else {
      lambdaConfig = await prisma.lambdaConfig.findFirst({
        where: {
          mediaType: 'video',
          modelId: video.modelId,
          isActive: true,
          isDefault: true,
        },
      });
    }

    if (!lambdaConfig) {
      return res.status(404).json({
        success: false,
        message: 'No suitable Lambda config found',
      });
    }

    // Get model configuration to know supported parameters
    const { getModelConfig } = await import('../utils/models.js');
    const modelConfig = getModelConfig(video.modelId, 'video');

    if (!modelConfig) {
      return res.status(404).json({
        success: false,
        message: `Model configuration not found for ${video.modelId}`,
      });
    }

    // Prepare generation parameters - only use supported params
    const allParams = {
      ...lambdaConfig.defaultParams,
      ...(video.generationParams as any),
    };

    // Filter to only include supported parameters
    const generationParams: any = {};
    const supportedParams = modelConfig.supportedParams || [];

    for (const param of supportedParams) {
      if (allParams[param] !== undefined) {
        generationParams[param] = allParams[param];
      }
    }

    // Always set prompt from optimizedPrompt
    generationParams.prompt = (video.generationParams as any)?.optimizedPrompt || video.visual;

    // Add seed if specified and supported
    if (video.seed !== null && supportedParams.includes('seed')) {
      generationParams.seed = video.seed;
    }

    // Add reference image from previous video for visual continuity (only if supported)
    if (supportedParams.includes('reference_images')) {
      if (video.referenceImageUrl) {
        generationParams.reference_images = [video.referenceImageUrl];
      } else if (video.videoOrder > 1) {
        // Get previous video's thumbnail for continuity
        const previousVideo = await prisma.sectionVideo.findFirst({
          where: {
            scriptId: video.scriptId,
            videoOrder: video.videoOrder - 1,
            status: { in: ['completed', 'approved'] },
          },
        });

        if (previousVideo?.thumbnailUrl) {
          generationParams.reference_images = [previousVideo.thumbnailUrl];

          // Update current video with reference URL
          await prisma.sectionVideo.update({
            where: { id: videoId },
            data: { referenceImageUrl: previousVideo.thumbnailUrl },
          });

          logger.info(`📸 Using reference image from video ${previousVideo.videoOrder} for continuity`);
        }
      }
    }

    // Log final generation parameters
    logger.info(`🎬 Generation parameters for video ${videoId}: ${JSON.stringify(generationParams, null, 2)}`);

    // Create Lambda job
    const jobId = uuidv4();
    const lambdaJob = await prisma.lambdaJob.create({
      data: {
        configId: lambdaConfig.id,
        userId: video.script.project.userId,
        projectId: video.script.projectId,
        jobId,
        lambdaName: 'generate-media',
        mediaType: 'video',
        modelId: video.modelId,
        prompt: generationParams.prompt,
        parameters: generationParams,
        status: 'pending',
      },
    });

    // Update video with lambdaJobId
    await prisma.sectionVideo.update({
      where: { id: videoId },
      data: {
        lambdaJobId: lambdaJob.id,
        status: 'pending',
      },
    });

    // Call Lambda API
    const lambdaUrl = `${process.env.LAMBDA_API_BASE_URL}/generate-media`;

    logger.info(`🚀 Calling Lambda for video ${videoId}: ${lambdaUrl}`);

    // Construct webhook URL for Replicate callbacks
    // IMPORTANT: Point to Lambda processWebhook, NOT backend directly!
    // Lambda will download from Replicate, upload to S3, then notify backend
    const webhookUrl = `${process.env.LAMBDA_API_BASE_URL}/webhook/replicate`;

    const lambdaResponse = await fetch(lambdaUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: video.script.project.userId || 'anonymous',
        mediaType: 'video',
        modelId: video.modelId,
        parameters: generationParams,
        webhook_url: webhookUrl, // Replicate will POST to this URL when done
      }),
    });

    logger.info(`📡 Webhook configured for video ${videoId}: ${webhookUrl}`);

    const lambdaResult = await lambdaResponse.json();

    logger.info(`📥 Lambda response status: ${lambdaResponse.status} ${lambdaResponse.ok ? 'OK' : 'ERROR'}`);
    logger.info(`📥 Lambda response body: ${JSON.stringify(lambdaResult, null, 2)}`);

    // Check if Lambda call was successful
    // Lambda returns: { jobId, status, replicateId, message, estimatedTime, estimatedCost }
    if (lambdaResponse.ok && lambdaResult.replicateId) {
      // Update job and video with Replicate job ID
      await prisma.lambdaJob.update({
        where: { id: lambdaJob.id },
        data: {
          replicateId: lambdaResult.replicateId,
          status: 'processing',
        },
      });

      await prisma.sectionVideo.update({
        where: { id: videoId },
        data: {
          replicateJobId: lambdaResult.replicateId,
          status: 'generating',
        },
      });

      logger.info(`✅ Lambda called successfully for video ${videoId}`);

      res.json({
        success: true,
        message: 'Video generation started',
        data: {
          videoId,
          lambdaJobId: lambdaJob.id,
          replicateJobId: lambdaResult.replicateId,
          status: 'generating',
          estimatedTime: lambdaResult.estimatedTime,
          estimatedCost: lambdaResult.estimatedCost,
        },
      });
    } else {
      // Lambda call failed
      logger.error('❌ Lambda call failed', lambdaResult);

      await prisma.lambdaJob.update({
        where: { id: lambdaJob.id },
        data: {
          status: 'failed',
          error: lambdaResult.message || 'Lambda call failed',
        },
      });

      await prisma.sectionVideo.update({
        where: { id: videoId },
        data: {
          status: 'failed',
          errorMessage: lambdaResult.message || 'Lambda call failed',
        },
      });

      res.status(500).json({
        success: false,
        message: `Lambda call failed: ${lambdaResult.message || 'Unknown error'}`,
      });
    }
  } catch (error: any) {
    logger.error('❌ Error generating video:', error.message);
    res.status(500).json({
      success: false,
      message: `Failed to generate video: ${error.message}`,
    });
  }
});

/**
 * GET /api/section-videos/:videoId/status
 *
 * Poll video generation status
 */
// ✅ SECURITY: requireVideoOwnership DISABLED FOR DEVELOPMENT
// Re-enable for production by uncommenting requireVideoOwnership middleware
router.get('/:videoId/status', statusPollingLimiter, /* requireVideoOwnership, */ async (req, res) => {
  try {
    const { videoId } = req.params;

    const video = await prisma.sectionVideo.findUnique({
      where: { id: videoId },
      include: {
        lambdaJob: true,
      },
    });

    if (!video) {
      return res.status(404).json({
        success: false,
        message: 'Video not found',
      });
    }

    logger.info(`📊 Video status response for ${videoId}:`, JSON.stringify({
      status: video.status,
      hasResultUrl: !!video.resultUrl,
      resultUrl: video.resultUrl,
      hasThumbnail: !!video.thumbnailUrl,
    }, null, 2));

    res.json({
      success: true,
      data: {
        videoId: video.id,
        status: video.status,
        resultUrl: video.resultUrl,
        thumbnailUrl: video.thumbnailUrl,
        errorMessage: video.errorMessage,
        processingTime: video.processingTime,
        actualCost: video.actualCost,
        lambdaJob: video.lambdaJob ? {
          id: video.lambdaJob.id,
          status: video.lambdaJob.status,
          replicateId: video.lambdaJob.replicateId,
        } : null,
      },
    });
  } catch (error: any) {
    logger.error('❌ Error fetching video status:', error.message);
    res.status(500).json({
      success: false,
      message: `Failed to fetch video status: ${error.message}`,
    });
  }
});

/**
 * POST /api/section-videos/:videoId/approve
 *
 * Approve a completed video for compilation
 */
// ✅ SECURITY: requireVideoOwnership DISABLED FOR DEVELOPMENT
// Re-enable for production by uncommenting requireVideoOwnership middleware
router.post('/:videoId/approve', /* requireVideoOwnership, */ async (req, res) => {
  try {
    const { videoId } = req.params;

    const video = await prisma.sectionVideo.findUnique({
      where: { id: videoId },
    });

    if (!video) {
      return res.status(404).json({
        success: false,
        message: 'Video not found',
      });
    }

    // Only allow approval of completed videos
    if (video.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: `Cannot approve video with status "${video.status}". Only completed videos can be approved.`,
      });
    }

    // Update video status to approved
    const updatedVideo = await prisma.sectionVideo.update({
      where: { id: videoId },
      data: { status: 'approved' },
    });

    logger.info(`✅ Video ${videoId} approved`);

    res.json({
      success: true,
      message: 'Video approved successfully',
      data: {
        videoId: updatedVideo.id,
        status: updatedVideo.status,
      },
    });
  } catch (error: any) {
    logger.error('❌ Error approving video:', error.message);
    res.status(500).json({
      success: false,
      message: `Failed to approve video: ${error.message}`,
    });
  }
});

/**
 * POST /api/section-videos/:videoId/regenerate
 *
 * Regenerate video with new seed or parameters
 *
 * Body:
 * - newSeed: number (optional) - New seed for regeneration
 * - referenceImageUrl: string (optional) - Reference image URL
 */
// ✅ SECURITY: requireVideoOwnership DISABLED FOR DEVELOPMENT
// Re-enable for production by uncommenting requireVideoOwnership middleware
router.post('/:videoId/regenerate', videoGenerationLimiter, /* requireVideoOwnership, */ validateBody(regenerateVideoSchema), async (req, res) => {
  try {
    const { videoId } = req.params;
    const { newSeed, referenceImageUrl } = req.body;

    const video = await prisma.sectionVideo.findUnique({
      where: { id: videoId },
    });

    if (!video) {
      return res.status(404).json({
        success: false,
        message: 'Video not found',
      });
    }

    // Update video with new parameters
    const updateData: any = {
      status: 'pending',
      errorMessage: null,
    };

    if (newSeed !== undefined) {
      updateData.seed = newSeed;
    }

    if (referenceImageUrl !== undefined) {
      updateData.referenceImageUrl = referenceImageUrl;
    }

    await prisma.sectionVideo.update({
      where: { id: videoId },
      data: updateData,
    });

    logger.info(`✅ Video ${videoId} reset for regeneration with seed ${newSeed || video.seed}`);

    res.json({
      success: true,
      message: 'Video reset for regeneration. Call /generate to start.',
      data: {
        videoId,
        seed: newSeed || video.seed,
        referenceImageUrl: referenceImageUrl || video.referenceImageUrl,
        status: 'pending',
      },
    });
  } catch (error: any) {
    logger.error('❌ Error regenerating video:', error.message);
    res.status(500).json({
      success: false,
      message: `Failed to regenerate video: ${error.message}`,
    });
  }
});

/**
 * POST /api/scripts/:scriptId/compile
 *
 * Compile all approved videos into a single video
 *
 * Body:
 * - outputFormat: 'mp4' | 'webm' (optional, default: mp4)
 * - quality: 'high' | 'medium' | 'low' (optional, default: high)
 */
// ✅ SECURITY: requireScriptOwnership DISABLED FOR DEVELOPMENT
// Re-enable for production by uncommenting requireScriptOwnership middleware
router.post('/:scriptId/compile', /* requireScriptOwnership, */ validateBody(compileScriptSchema), async (req, res) => {
  try {
    const { scriptId } = req.params;
    const { outputFormat = 'mp4', quality = 'high' } = req.body;

    // Get all approved videos
    const videos = await prisma.sectionVideo.findMany({
      where: {
        scriptId,
        status: 'approved',
        resultUrl: { not: null },
      },
      orderBy: { videoOrder: 'asc' },
    });

    if (videos.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No approved videos found for compilation',
      });
    }

    // Extract video URLs
    const videoUrls = videos.map(v => v.resultUrl!);

    logger.info(`🎬 Compiling ${videos.length} videos for script ${scriptId}`);

    // Calculate total duration safely
    const totalDuration = videos.reduce((sum, v) => sum + (v.duration || 0), 0);

    logger.info(`📊 Total duration: ${totalDuration}s, Video count: ${videos.length}`);

    // Get userId and sectionId from first video
    const userId = videos[0]?.userId || 'unknown';
    const sectionId = videos[0]?.sectionId || 'unknown';

    // Call Lambda compile-videos endpoint
    const lambdaUrl = process.env.LAMBDA_API_BASE_URL || 'https://jp4xy0391j.execute-api.us-east-1.amazonaws.com/homolog';
    const compileEndpoint = `${lambdaUrl}/compile-videos`;

    logger.info(`📤 Calling Lambda compilation endpoint: ${compileEndpoint}`);

    try {
      const lambdaResponse = await fetch(compileEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scriptId,
          videoUrls,
          userId,
          sectionId,
          outputFormat,
          quality
        }),
      });

      const lambdaResult = await lambdaResponse.json();

      logger.info(`✅ Lambda response received:`, {
        status: lambdaResponse.status,
        success: lambdaResult.success,
        message: lambdaResult.message
      });

      if (lambdaResult.success) {
        // Return success with compilation details
        res.json({
          success: true,
          message: lambdaResult.message || 'Video compilation completed',
          data: {
            scriptId,
            videoCount: videos.length,
            totalDuration,
            compiledVideoUrl: lambdaResult.data?.compiledVideoUrl,
            fileSize: lambdaResult.data?.fileSize,
            jobId: lambdaResult.data?.jobId,
            duration: lambdaResult.data?.duration
          },
        });
      } else {
        // Lambda returned error
        logger.error(`❌ Lambda compilation failed:`, lambdaResult.message);
        res.status(500).json({
          success: false,
          message: `Compilation failed: ${lambdaResult.message}`,
        });
      }
    } catch (lambdaError: any) {
      logger.error('❌ Error calling Lambda:', lambdaError.message);
      res.status(500).json({
        success: false,
        message: `Failed to call compilation service: ${lambdaError.message}`,
      });
    }
  } catch (error: any) {
    logger.error('❌ Error compiling videos:', error.message);
    res.status(500).json({
      success: false,
      message: `Failed to compile videos: ${error.message}`,
    });
  }
});

/**
 * GET /api/scripts/:scriptId/export
 *
 * Export detailed script as JSON or PDF
 */
router.get('/:scriptId/export', async (req, res) => {
  try {
    const { scriptId } = req.params;
    const { format = 'json' } = req.query;

    const script = await prisma.sectionDetailedScript.findUnique({
      where: { id: scriptId },
      include: {
        videos: {
          orderBy: { videoOrder: 'asc' },
        },
        section: true,
        project: true,
      },
    });

    if (!script) {
      return res.status(404).json({
        success: false,
        message: 'Script not found',
      });
    }

    if (format === 'json') {
      res.json({
        success: true,
        data: script,
      });
    } else {
      // In production, generate PDF with script details
      res.status(501).json({
        success: false,
        message: 'PDF export not yet implemented',
        note: 'Use format=json for now',
      });
    }
  } catch (error: any) {
    logger.error('❌ Error exporting script:', error.message);
    res.status(500).json({
      success: false,
      message: `Failed to export script: ${error.message}`,
    });
  }
});

export default router;
