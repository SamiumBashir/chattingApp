import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env.js';
import { AppError } from '../utils/apiResponse.js';
import { logger } from '../utils/logger.js';
import { validateUploadedFile, sanitizeFileName } from '../utils/fileValidation.js';

// Configure Cloudinary SDK
if (env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

export const ALLOWED_UPLOAD_FOLDERS = [
  'connectly/attachments',
  'connectly/avatars',
  'connectly/voice',
  'connectly/direct',
  'connectly/chat',
] as const;

export type AllowedUploadFolder = typeof ALLOWED_UPLOAD_FOLDERS[number];

export interface UploadSignatureResponse {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
  resourceType?: string;
}

export class UploadService {
  /**
   * Generate secure signed upload parameters for client-side direct upload
   */
  static generateSignature(
    folder: string = 'connectly/attachments',
    resourceType: string = 'auto'
  ): UploadSignatureResponse {
    // Validate folder against strict whitelist
    if (!ALLOWED_UPLOAD_FOLDERS.includes(folder as AllowedUploadFolder)) {
      throw new AppError(
        `Invalid upload folder. Must be one of: ${ALLOWED_UPLOAD_FOLDERS.join(', ')}`,
        400,
        'INVALID_UPLOAD_FOLDER'
      );
    }

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
      resourceType,
    };
  }

  /**
   * Delete asset from Cloudinary by public ID
   */
  static async deleteAsset(publicId: string, resourceType: 'image' | 'raw' | 'video' = 'image') {
    if (!publicId || !/^[a-zA-Z0-9/_-]+$/.test(publicId)) {
      throw new AppError('Invalid public ID format', 400, 'INVALID_PUBLIC_ID');
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
    folder: string = 'connectly/direct'
  ) {
    if (!ALLOWED_UPLOAD_FOLDERS.includes(folder as AllowedUploadFolder)) {
      throw new AppError(
        `Invalid upload folder. Must be one of: ${ALLOWED_UPLOAD_FOLDERS.join(', ')}`,
        400,
        'INVALID_UPLOAD_FOLDER'
      );
    }

    // Validate file integrity, extension allowlist, and size bounds
    const cleanFileName = sanitizeFileName(fileName);
    const validation = validateUploadedFile(cleanFileName, mimeType, buffer.length);
    if (!validation.valid) {
      throw new AppError(
        validation.error || 'Invalid file format',
        400,
        validation.code || 'UNSUPPORTED_FILE_TYPE'
      );
    }

    const resourceType = mimeType.startsWith('image/')
      ? 'image'
      : mimeType.startsWith('audio/') || mimeType.startsWith('video/')
      ? 'video'
      : 'raw';

    return new Promise<{
      url: string;
      secureUrl: string;
      publicId: string;
      fileName: string;
      fileType: string;
      fileSize: number;
    }>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: resourceType,
          filename_override: cleanFileName,
          use_filename: true,
        },
        (error, result) => {
          if (error || !result) {
            logger.warn(`Cloudinary upload failed (${error?.message}).`);

            // In production, reject immediately to prevent database bloat from Base64
            if (env.NODE_ENV === 'production') {
              return reject(
                new AppError(
                  `Upload failed: ${error?.message || 'Invalid Cloudinary configuration'}. Please check storage credentials.`,
                  500
                )
              );
            }

            // Resilient fallback strictly for non-production environments under 5MB
            if (buffer.length <= 5 * 1024 * 1024) {
              const base64Data = buffer.toString('base64');
              const dataUrl = `data:${mimeType};base64,${base64Data}`;
              const fallbackId = `fallback_${Date.now()}_${cleanFileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
              return resolve({
                url: dataUrl,
                secureUrl: dataUrl,
                publicId: fallbackId,
                fileName: cleanFileName,
                fileType: mimeType,
                fileSize: buffer.length,
              });
            }

            return reject(
              new AppError(
                `Upload failed: ${error?.message || 'Invalid Cloudinary credentials'}.`,
                500
              )
            );
          }

          resolve({
            url: result.secure_url || result.url,
            secureUrl: result.secure_url || result.url,
            publicId: result.public_id,
            fileName: cleanFileName,
            fileType: mimeType,
            fileSize: result.bytes,
          });
        }
      );

      uploadStream.end(buffer);
    });
  }
}
