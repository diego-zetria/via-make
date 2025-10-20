/**
 * Compile Videos Lambda Handler
 * Concatenates multiple approved videos into a single final video using FFmpeg
 *
 * FFmpeg is available via Lambda Layer at /opt/bin/ffmpeg
 * Uses concat demuxer for efficient video concatenation without re-encoding
 */

const logger = require('./lib/logger');
const { postgres } = require('./lib/database');
const s3Manager = require('./lib/s3');
const { execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

/**
 * Lambda handler for video compilation
 * @param {Object} event - API Gateway event or direct invocation
 * @returns {Object} API Gateway response or compilation result
 */
exports.handler = async (event) => {
  const startTime = Date.now();
  const log = logger.create({
    context: 'compile-videos',
    requestId: event.requestContext?.requestId || `compile-${Date.now()}`
  });

  try {
    // Parse input
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event;
    const { scriptId, videoUrls, userId, sectionId } = body;

    if (!scriptId || !videoUrls || videoUrls.length === 0) {
      return createResponse(400, {
        success: false,
        message: 'Missing required fields: scriptId, videoUrls'
      });
    }

    log.info('Starting video compilation', {
      scriptId,
      videoCount: videoUrls.length,
      userId,
      sectionId
    });

    // Create unique job ID
    const jobId = `compile-${scriptId}-${Date.now()}`;
    const tmpDir = `/tmp/${jobId}`;

    // Create temp directory
    await fs.mkdir(tmpDir, { recursive: true });
    log.info('Created temp directory', { tmpDir });

    // Step 1: Download videos from S3 to /tmp
    log.info('Downloading videos from S3');
    const downloadedFiles = await downloadVideosFromS3(videoUrls, tmpDir, log);

    if (downloadedFiles.length !== videoUrls.length) {
      throw new Error(`Failed to download all videos. Expected ${videoUrls.length}, got ${downloadedFiles.length}`);
    }

    log.info('All videos downloaded', {
      count: downloadedFiles.length,
      files: downloadedFiles.map(f => f.filename)
    });

    // Step 2: Create filelist.txt for FFmpeg concat demuxer
    const filelistPath = path.join(tmpDir, 'filelist.txt');
    const filelistContent = downloadedFiles
      .map(file => `file '${file.path}'`)
      .join('\n');

    await fs.writeFile(filelistPath, filelistContent);
    log.info('Created filelist.txt', { path: filelistPath });

    // Step 3: Execute FFmpeg concat
    const outputPath = path.join(tmpDir, 'compiled.mp4');
    const ffmpegCmd = `/opt/bin/ffmpeg -f concat -safe 0 -i ${filelistPath} -c copy ${outputPath}`;

    log.info('Executing FFmpeg', { command: ffmpegCmd });

    try {
      const ffmpegOutput = execSync(ffmpegCmd, {
        stdio: 'pipe',
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      });
      log.info('FFmpeg completed', {
        output: ffmpegOutput.toString().substring(0, 500)
      });
    } catch (ffmpegError) {
      log.error('FFmpeg execution failed', {
        error: ffmpegError.message,
        stderr: ffmpegError.stderr?.toString(),
        stdout: ffmpegError.stdout?.toString()
      });
      throw new Error(`FFmpeg failed: ${ffmpegError.message}`);
    }

    // Step 4: Verify output file exists
    const stats = await fs.stat(outputPath);
    log.info('Compiled video created', {
      size: stats.size,
      sizeInMB: (stats.size / 1024 / 1024).toFixed(2)
    });

    // Step 5: Upload compiled video to S3
    log.info('Uploading compiled video to S3');

    const uploadResult = await s3Manager.uploadFile({
      filePath: outputPath,
      userId,
      mediaType: 'compiled',
      jobId: jobId,
      filename: `final-${scriptId}.mp4`,
      contentType: 'video/mp4',
      metadata: {
        scriptId,
        userId,
        sectionId: sectionId || 'unknown',
        videoCount: videoUrls.length.toString(),
        compiledAt: new Date().toISOString()
      }
    });

    log.info('Compiled video uploaded to S3', {
      url: uploadResult.url,
      key: uploadResult.s3Key,
      size: uploadResult.size
    });

    // Step 6: Update database with compiled video URL
    await postgres.query(
      `UPDATE vsl_frontend.section_detailed_scripts
       SET compiled_video_url = $1,
           compiled_at = NOW(),
           updated_at = NOW()
       WHERE id = $2`,
      [uploadResult.url, scriptId]
    );

    log.info('Database updated with compiled video URL', { scriptId });

    // Step 7: Cleanup /tmp directory
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
      log.info('Temp directory cleaned up', { tmpDir });
    } catch (cleanupError) {
      log.warn('Failed to cleanup temp directory', {
        error: cleanupError.message,
        tmpDir
      });
    }

    const duration = Date.now() - startTime;
    log.info('Video compilation completed', {
      jobId,
      scriptId,
      duration,
      compiledUrl: uploadResult.url
    });

    // Step 8: Return success
    return createResponse(200, {
      success: true,
      message: 'Video compilation completed successfully',
      data: {
        jobId,
        scriptId,
        compiledVideoUrl: uploadResult.url,
        videoCount: videoUrls.length,
        fileSize: uploadResult.size,
        duration
      }
    });

  } catch (error) {
    log.error('Video compilation failed', {
      error: error.message,
      stack: error.stack
    });

    return createResponse(500, {
      success: false,
      message: 'Video compilation failed',
      error: error.message
    });
  }
};

/**
 * Download videos from S3 to local /tmp directory
 */
async function downloadVideosFromS3(videoUrls, tmpDir, log) {
  const downloads = videoUrls.map(async (url, index) => {
    try {
      // Parse S3 URL: https://bucket.s3.region.amazonaws.com/key
      const urlParts = new URL(url);
      const bucket = urlParts.hostname.split('.')[0];
      const key = urlParts.pathname.substring(1); // Remove leading /

      log.info(`Downloading video ${index + 1}/${videoUrls.length}`, {
        bucket,
        key: key.substring(0, 50) + '...'
      });

      // Download from S3
      const command = new GetObjectCommand({ Bucket: bucket, Key: key });
      const response = await s3Client.send(command);

      // Read stream to buffer
      const chunks = [];
      for await (const chunk of response.Body) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      // Save to /tmp
      const filename = `video-${index + 1}.mp4`;
      const filePath = path.join(tmpDir, filename);
      await fs.writeFile(filePath, buffer);

      log.info(`Video ${index + 1} downloaded`, {
        filename,
        size: buffer.length,
        sizeInMB: (buffer.length / 1024 / 1024).toFixed(2)
      });

      return {
        filename,
        path: filePath,
        size: buffer.length,
        index
      };
    } catch (error) {
      log.error(`Failed to download video ${index + 1}`, {
        url: url.substring(0, 50) + '...',
        error: error.message
      });
      throw error;
    }
  });

  return Promise.all(downloads);
}

/**
 * Create API Gateway response
 */
function createResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Methods': 'POST,OPTIONS'
    },
    body: JSON.stringify(body)
  };
}
