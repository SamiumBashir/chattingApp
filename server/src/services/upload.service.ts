import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env.js';
import { AppError } from '../utils/apiResponse.js';
import { logger } from '../utils/logger.js';

// Configure Cloudinary SDK
if (env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

export interface UploadSignatureResponse {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
}

export class UploadService {
  /**
   * Generate secure signed upload parameters for client-side direct upload
   */
  static generateSignature(folder = 'connectly/attachments'): UploadSignatureResponse {
    const timestamp = Math.round(new Date().getTime() / 1000);
    const apiSecret = env.CLOUDINARY_API_SECRET || 'mock_secret';

    const paramsToSign: Record<string, any> = {
      timestamp,
      folder,
    };

    let signature = '';
    try {
      signature = cloudinary.utils.api_sign_request(paramsToSign, apiSecret);
    } catch {
      // Fallback signature for mock/testing environments
      signature = `mock_sig_${timestamp}`;
    }

    return {
      signature,
      timestamp,
      apiKey: env.CLOUDINARY_API_KEY || 'mock_key',
      cloudName: env.CLOUDINARY_CLOUD_NAME || 'mock_cloud',
      folder,
    };
  }

  /**
   * Delete asset from Cloudinary by public ID
   */
  static async deleteAsset(publicId: string, resourceType: 'image' | 'raw' | 'video' = 'image') {
    if (!publicId) {
      throw new AppError('Public ID is required', 400);
    }

    try {
      const result = await cloudinary.uploader.destroy(publicId, {
        resource_type: resourceType,
      });
      return result;
    } catch (error: any) {
      throw new AppError(`Failed to delete asset: ${error.message || 'Cloudinary error'}`, 500);
    }
  }

  /**
   * Upload buffer directly (for fallback or dev local handling)
   */
  static async uploadBuffer(
    buffer: Buffer,
    fileName: string,
    mimeType: string,
    folder = 'connectly/direct'
  ) {
    const resourceType = mimeType.startsWith('image/') ? 'image' : 'raw';

    return new Promise<{
      url: string;
      publicId: string;
      fileName: string;
      fileType: string;
      fileSize: number;
    }>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: resourceType,
          filename_override: fileName,
          use_filename: true,
        },
        (error, result) => {
          if (error || !result) {
            logger.warn(`Cloudinary upload failed (${error?.message}). Falling back to inline data URL.`);
            // Resilient fallback: For media under 5MB, generate data URL so messaging never breaks
            if (buffer.length <= 5 * 1024 * 1024) {
              const base64Data = buffer.toString('base64');
              const dataUrl = `data:${mimeType};base64,${base64Data}`;
              const fallbackId = `fallback_${Date.now()}_${fileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
              return resolve({
                url: dataUrl,
                publicId: fallbackId,
                fileName,
                fileType: mimeType,
                fileSize: buffer.length,
              });
            }

            return reject(
              new AppError(
                `Upload failed: ${error?.message || 'Invalid Cloudinary credentials'}. Please verify CLOUDINARY_CLOUD_NAME in settings.`,
                500
              )
            );
          }

          resolve({
            url: result.secure_url,
            publicId: result.public_id,
            fileName,
            fileType: mimeType,
            fileSize: result.bytes,
          });
        }
      );

      uploadStream.end(buffer);
    });
  }
}
