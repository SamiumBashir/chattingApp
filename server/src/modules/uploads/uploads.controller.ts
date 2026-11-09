import { Request, Response, NextFunction } from 'express';
import { UploadService } from '../../services/upload.service.js';
import { sendSuccess, AppError } from '../../utils/apiResponse.js';
import { AuthenticatedRequest } from '../../types/index.js';
import { User } from '../../models/User.js';
import { Message } from '../../models/Message.js';
import { sanitizeFileName, escapeRegex } from '../../utils/fileValidation.js';

export class UploadController {
  /**
   * Request signed Cloudinary upload params
   */
  static async getSignature(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const folder = (req.body.folder as string) || 'connectly/attachments';
      const resourceType = (req.body.resourceType as string) || 'auto';
      const signatureData = UploadService.generateSignature(folder, resourceType);

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
      const { url, secureUrl, publicId, fileName, fileType, fileSize } = req.body;
      const cleanFileName = sanitizeFileName(fileName);

      sendSuccess(
        res,
        {
          attachment: {
            url,
            secureUrl: secureUrl || url,
            publicId,
            fileName: cleanFileName,
            fileType,
            fileSize,
          },
        },
        200
      );
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
      const cleanFileName = sanitizeFileName(req.file.originalname);
      const result = await UploadService.uploadBuffer(
        req.file.buffer,
        cleanFileName,
        req.file.mimetype,
        folder
      );

      sendSuccess(
        res,
        {
          attachment: result,
        },
        201
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete uploaded asset by public ID (Authenticated with ownership validation)
   */
  static async deleteAsset(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const publicIdParam = req.params.publicId;
      const publicId = Array.isArray(publicIdParam) ? publicIdParam[0] : publicIdParam;
      const resourceType = (req.query.resourceType as 'image' | 'raw' | 'video') || 'image';

      if (!publicId || !/^[a-zA-Z0-9/_-]+$/.test(publicId)) {
        throw new AppError('Invalid public ID format', 400, 'INVALID_PUBLIC_ID');
      }

      const userId = req.user?.userId;
      const role = req.user?.role;
      const isAdmin = role === 'admin' || role === 'superadmin';

      if (!isAdmin) {
        // Verify ownership: was it used as their avatar or in a message sent by this user?
        const [isAvatar, messageWithAsset] = await Promise.all([
          User.exists({ _id: userId, avatar: { $regex: escapeRegex(publicId) } }),
          Message.exists({ sender: userId, 'attachments.publicId': publicId }),
        ]);

        if (!isAvatar && !messageWithAsset) {
          throw new AppError('You do not have permission to delete this asset', 403, 'FORBIDDEN');
        }
      }

      await UploadService.deleteAsset(publicId, resourceType);

      sendSuccess(res, { publicId }, 200);
    } catch (error) {
      next(error);
    }
  }
}
