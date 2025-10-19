/**
 * S3 Upload and Management Utilities
 * Handles media uploads with organized structure and lifecycle management
 */

const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const logger = require('./logger');

class S3Manager {
  constructor() {
    this.client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1'
    });
    this.bucket = process.env.S3_BUCKET || 'vsl-homolog-media';
  }

  /**
   * Generate organized S3 key for media file
   * Structure: {mediaType}/{userId}/{YYYY}/{MM}/{DD}/{jobId}/{filename}
   * @param {Object} params
   * @param {string} params.userId - User ID
   * @param {string} params.mediaType - Media type (video, image, audio)
   * @param {string} params.jobId - Job ID
   * @param {string} params.filename - File name (e.g., 'original.mp4', 'thumbnail.jpg')
   * @returns {string} S3 key
   */
  generateS3Key({ userId, mediaType, jobId, filename }) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    return `${mediaType}/${userId}/${year}/${month}/${day}/${jobId}/${filename}`;
  }

  /**
   * Upload media file to S3
   * @param {Object} params
   * @param {Buffer} params.buffer - File buffer
   * @param {string} params.s3Key - S3 key (path)
   * @param {string} params.contentType - MIME type
   * @param {Object} params.metadata - Additional metadata
   * @returns {Promise<Object>} Upload result with URL
   */
  async uploadMedia({ buffer, s3Key, contentType, metadata = {} }) {
    const log = logger.create({ context: 's3-manager', operation: 'upload' });

    try {
      log.info('Uploading to S3', {
        bucket: this.bucket,
        key: s3Key,
        size: buffer.length,
        contentType
      });

      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: s3Key,
        Body: buffer,
        ContentType: contentType,
        Metadata: {
          ...metadata,
          uploadedAt: new Date().toISOString()
        },
        ServerSideEncryption: 'AES256',
        CacheControl: 'max-age=31536000' // 1 year for immutable content
      });

      await this.client.send(command);

      const url = `https://${this.bucket}.s3.amazonaws.com/${s3Key}`;

      log.info('Upload successful', {
        url,
        size: buffer.length,
        sizeKB: (buffer.length / 1024).toFixed(2)
      });

      return {
        url,
        s3Key,
        bucket: this.bucket,
        size: buffer.length
      };

    } catch (error) {
      log.error('Upload failed', {
        error: error.message,
        s3Key
      });
      throw new Error(`S3 upload failed: ${error.message}`);
    }
  }

  /**
   * Upload media from URL (download and upload)
   * @param {Object} params
   * @param {string} params.sourceUrl - Source URL to download from
   * @param {string} params.userId - User ID
   * @param {string} params.mediaType - Media type
   * @param {string} params.jobId - Job ID
   * @param {string} params.filename - Destination filename
   * @param {string} params.contentType - MIME type
   * @param {Object} params.metadata - Additional metadata
   * @returns {Promise<Object>} Upload result
   */
  async uploadFromUrl({ sourceUrl, userId, mediaType, jobId, filename, contentType, metadata = {} }) {
    const log = logger.create({ context: 's3-manager', operation: 'upload-from-url' });

    try {
      log.info('Downloading from URL', { sourceUrl: sourceUrl.substring(0, 50) + '...' });

      // Download file from URL
      const response = await fetch(sourceUrl);
      if (!response.ok) {
        throw new Error(`Download failed with status ${response.status}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      log.info('Downloaded from URL', { size: buffer.length });

      // Generate S3 key
      const s3Key = this.generateS3Key({ userId, mediaType, jobId, filename });

      // Upload to S3
      return await this.uploadMedia({
        buffer,
        s3Key,
        contentType,
        metadata: {
          ...metadata,
          sourceUrl
        }
      });

    } catch (error) {
      log.error('Upload from URL failed', {
        error: error.message,
        sourceUrl: sourceUrl.substring(0, 50) + '...'
      });
      throw error;
    }
  }

  /**
   * Generate presigned URL for temporary access
   * @param {string} s3Key - S3 key
   * @param {number} expiresIn - Expiration in seconds (default: 3600 = 1 hour)
   * @returns {Promise<string>} Presigned URL
   */
  async generateSignedUrl(s3Key, expiresIn = 3600) {
    const log = logger.create({ context: 's3-manager', operation: 'signed-url' });

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: s3Key
      });

      const url = await getSignedUrl(this.client, command, { expiresIn });

      log.info('Generated signed URL', {
        s3Key,
        expiresIn
      });

      return url;

    } catch (error) {
      log.error('Failed to generate signed URL', {
        error: error.message,
        s3Key
      });
      throw error;
    }
  }

  /**
   * Delete media file from S3
   * @param {string} s3Key - S3 key
   * @returns {Promise<void>}
   */
  async deleteMedia(s3Key) {
    const log = logger.create({ context: 's3-manager', operation: 'delete' });

    try {
      log.info('Deleting from S3', { s3Key });

      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: s3Key
      });

      await this.client.send(command);

      log.info('Deletion successful', { s3Key });

    } catch (error) {
      log.error('Deletion failed', {
        error: error.message,
        s3Key
      });
      throw error;
    }
  }

  /**
   * Get content type from file extension or media type
   * @param {string} filename - File name or extension
   * @param {string} mediaType - Media type (video, image, audio)
   * @returns {string} MIME type
   */
  getContentType(filename, mediaType) {
    const ext = filename.split('.').pop().toLowerCase();

    const mimeTypes = {
      // Video
      'mp4': 'video/mp4',
      'webm': 'video/webm',
      'mov': 'video/quicktime',
      'avi': 'video/x-msvideo',

      // Image
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',

      // Audio
      'mp3': 'audio/mpeg',
      'wav': 'audio/wav',
      'ogg': 'audio/ogg',
      'm4a': 'audio/mp4'
    };

    if (mimeTypes[ext]) {
      return mimeTypes[ext];
    }

    // Fallback to generic types
    const genericTypes = {
      'video': 'video/mp4',
      'image': 'image/jpeg',
      'audio': 'audio/mpeg'
    };

    return genericTypes[mediaType] || 'application/octet-stream';
  }

  /**
   * Extract file extension from URL
   * @param {string} url - URL
   * @returns {string} File extension
   */
  extractExtension(url) {
    try {
      const pathname = new URL(url).pathname;
      const match = pathname.match(/\.([^.]+)$/);
      return match ? match[1] : 'bin';
    } catch {
      return 'bin';
    }
  }

  /**
   * Get public URL for S3 object
   * @param {string} s3Key - S3 key
   * @returns {string} Public URL
   */
  getPublicUrl(s3Key) {
    return `https://${this.bucket}.s3.amazonaws.com/${s3Key}`;
  }
}

// Export singleton instance
module.exports = new S3Manager();
