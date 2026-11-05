import { Request, Response, NextFunction } from 'express';
import { UploadService } from '../../services/upload.service.js';
import { sendSuccess, AppError } from '../../utils/apiResponse.js';

export class UploadController {
  /**
   * Request signed Cloudinary upload params
   */
  static async getSignature(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const folder = (req.body.folder as string) || 'connectly/attachments';
      const signatureData = UploadService.generateSignature(folder);

      sendSuccess(res, signatureData, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Complete an upload and register attachment metadata
   */
  static async completeUpload(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { url, publicId, fileName, fileType, fileSize } = req.body;

      sendSuccess(res, {
        attachment: {
          url,
          publicId,
          fileName,
          fileType,
          fileSize,
        },
      }, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Direct file upload endpoint (multipart/form-data)
   */
  static async directUpload(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.file) {
        throw new AppError('No file uploaded', 400);
      }

      const folder = (req.body.folder as string) || 'connectly/attachments';
      const result = await UploadService.uploadBuffer(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        folder
      );

      sendSuccess(res, {
        attachment: result,
      }, 201);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete uploaded asset by public ID
   */
  static async deleteAsset(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const publicIdParam = req.params.publicId;
      const publicId = Array.isArray(publicIdParam) ? publicIdParam[0] : publicIdParam;
      const resourceType = (req.query.resourceType as 'image' | 'raw' | 'video') || 'image';

      await UploadService.deleteAsset(publicId, resourceType);

      sendSuccess(res, { publicId }, 200);
    } catch (error) {
      next(error);
    }
  }
}
