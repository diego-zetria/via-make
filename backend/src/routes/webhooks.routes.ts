/**
 * Webhook Routes
 *
 * Endpoints for receiving callbacks from external services.
 * Currently supports Replicate video generation webhooks.
 */

import { Router } from 'express';
import { logger } from '../utils/logger.js';
import { prisma } from '../config/database.js';
import crypto from 'crypto';

const router = Router();

/**
 * Verify Replicate webhook signature
 *
 * Replicate signs webhooks with HMAC-SHA256 using webhook secret.
 * Signature is sent in x-replicate-signature header.
 */
function verifyReplicateSignature(
  payload: string,
  signature: string | undefined,
  secret: string
): boolean {
  if (!signature) {
    logger.warn('⚠️ Webhook received without signature');
    return false;
  }

  const hmac = crypto.createHmac('sha256', secret);
  const expectedSignature = hmac.update(payload).digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * POST /api/webhooks/replicate
 *
 * Receives callbacks from Replicate when video generation completes.
 *
 * Replicate sends:
 * - id: Replicate prediction ID
 * - status: "succeeded", "failed", "canceled"
 * - output: Array of output URLs (for succeeded)
 * - error: Error message (for failed)
 * - metrics: Processing time and cost information
 */
router.post('/replicate', async (req, res) => {
  // LOG IMMEDIATELY - BEFORE ANYTHING ELSE
  logger.info(`🚨 WEBHOOK CALLED! Headers: ${JSON.stringify(req.headers)}, Body: ${JSON.stringify(req.body)}`);

  try {
    const signature = req.headers['x-replicate-signature'] as string | undefined;
    const payload = JSON.stringify(req.body);

    // ✅ SECURITY: Verify webhook signature (DISABLED FOR DEVELOPMENT)
    // Re-enable for production when Lambda forwards Replicate signature headers:
    // const webhookSecret = process.env.REPLICATE_WEBHOOK_SECRET;
    // if (webhookSecret) {
    //   const isValid = verifyReplicateSignature(payload, signature, webhookSecret);
    //   if (!isValid) {
    //     logger.error('❌ Invalid webhook signature');
    //     return res.status(401).json({
    //       success: false,
    //       message: 'Invalid webhook signature',
    //     });
    //   }
    // } else {
    //   logger.warn('⚠️ REPLICATE_WEBHOOK_SECRET not set - webhook signature not verified');
    // }
    logger.info('⚠️ Webhook signature verification DISABLED for development');

    const { id: replicateJobId, status, output, error, metrics } = req.body;

    const outputUrls = Array.isArray(output) ? output : output ? [output] : [];

    logger.info(`📥 Replicate webhook received:`, JSON.stringify({
      replicateJobId,
      status,
      hasOutput: !!output,
      outputType: typeof output,
      outputIsArray: Array.isArray(output),
      outputUrls: outputUrls,
      firstUrl: outputUrls[0] || null,
      error,
    }, null, 2));

    // Find Lambda job by Replicate ID
    const lambdaJob = await prisma.lambdaJob.findFirst({
      where: { replicateId: replicateJobId },
    });

    logger.info(`🔍 Lambda job search result:`, JSON.stringify({
      found: !!lambdaJob,
      lambdaJobId: lambdaJob?.id,
      searchedReplicateId: replicateJobId,
    }, null, 2));

    if (!lambdaJob) {
      logger.warn(`⚠️ Lambda job not found for Replicate ID: ${replicateJobId}`);
      // Still return 200 to prevent Replicate from retrying
      return res.json({
        success: true,
        message: 'Webhook received but job not found',
      });
    }

    // Find associated video
    const video = await prisma.sectionVideo.findFirst({
      where: { replicateJobId: replicateJobId },
    });

    logger.info(`🔍 Video search result:`, JSON.stringify({
      found: !!video,
      videoId: video?.id,
      videoStatus: video?.status,
      searchedReplicateId: replicateJobId,
    }, null, 2));

    // Only process terminal statuses (succeeded, failed, canceled)
    // Ignore intermediate statuses like 'starting', 'processing'
    if (!['succeeded', 'failed', 'canceled'].includes(status)) {
      logger.info(`⏭️ Ignoring non-terminal webhook status: ${status}`);
      return res.json({
        success: true,
        message: `Webhook received but status ${status} is not terminal`,
      });
    }

    // Update Lambda job based on status
    const updateData: any = {
      status: status === 'succeeded' ? 'completed' : status === 'failed' ? 'failed' : 'canceled',
      completedAt: new Date(),
    };

    if (status === 'succeeded' && output) {
      // Handle both string and array outputs from Replicate
      const outputUrls = Array.isArray(output) ? output : [output];

      if (outputUrls.length > 0 && outputUrls[0]) {
        updateData.resultUrl = outputUrls[0]; // First output URL
        // Store output and metrics in metadata field instead
        updateData.metadata = { output, metrics };
      }
    }

    if (status === 'failed' && error) {
      updateData.error = typeof error === 'string' ? error : JSON.stringify(error);
    }

    if (metrics?.predict_time) {
      updateData.processingTime = Math.round(metrics.predict_time);
    }

    // Update Lambda job
    await prisma.lambdaJob.update({
      where: { id: lambdaJob.id },
      data: updateData,
    });

    logger.info(`✅ Lambda job ${lambdaJob.id} updated to ${updateData.status}`);

    // Update associated video if exists
    if (video) {
      const videoUpdateData: any = {
        status: status === 'succeeded' ? 'completed' : status === 'failed' ? 'failed' : 'canceled',
      };

      if (status === 'succeeded' && output) {
        // Handle both string and array outputs from Replicate
        const outputUrls = Array.isArray(output) ? output : [output];

        if (outputUrls.length > 0 && outputUrls[0]) {
          videoUpdateData.resultUrl = outputUrls[0];

          // If output has multiple items, second could be thumbnail
          if (outputUrls.length > 1) {
            videoUpdateData.thumbnailUrl = outputUrls[1];
          }
        }
      }

      if (status === 'failed' && error) {
        videoUpdateData.errorMessage = typeof error === 'string' ? error : JSON.stringify(error);
      }

      if (metrics?.predict_time) {
        videoUpdateData.processingTime = Math.round(metrics.predict_time);
      }

      // Calculate actual cost if metrics provided
      if (metrics?.total_time) {
        // Simplified cost calculation: $0.10 per processing second
        videoUpdateData.actualCost = (metrics.total_time * 0.10).toFixed(4);
      }

      const updatedVideo = await prisma.sectionVideo.update({
        where: { id: video.id },
        data: videoUpdateData,
      });

      logger.info(`✅ Video ${video.id} updated to ${videoUpdateData.status}:`, JSON.stringify({
        resultUrl: updatedVideo.resultUrl,
        thumbnailUrl: updatedVideo.thumbnailUrl,
        status: updatedVideo.status,
      }, null, 2));
    }

    // TODO: Emit WebSocket event to notify frontend
    // io.to(`project-${lambdaJob.projectId}`).emit('video-status', { videoId, status });

    res.json({
      success: true,
      message: 'Webhook processed successfully',
      jobId: lambdaJob.id,
      videoId: video?.id,
    });
  } catch (error: any) {
    logger.error('❌ Error processing Replicate webhook:', error);

    // Return 200 to prevent Replicate from retrying on our errors
    res.status(200).json({
      success: false,
      message: 'Error processing webhook',
      error: error.message,
    });
  }
});

/**
 * GET /api/webhooks/replicate/test
 *
 * Test endpoint to verify webhook is accessible.
 * Replicate may call this during webhook setup.
 */
router.get('/replicate/test', (req, res) => {
  res.json({
    success: true,
    message: 'Replicate webhook endpoint is accessible',
    timestamp: new Date().toISOString(),
  });
});

export default router;
