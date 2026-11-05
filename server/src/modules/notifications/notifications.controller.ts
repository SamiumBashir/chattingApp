import { Request, Response, NextFunction } from 'express';
import { NotificationService } from '../../services/notification.service.js';
import { sendSuccess } from '../../utils/apiResponse.js';

export class NotificationController {
  static async getNotifications(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user!.userId;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const unreadOnly = req.query.unreadOnly === 'true';

      const result = await NotificationService.getUserNotifications(userId, {
        page,
        limit,
        unreadOnly,
      });

      sendSuccess(res, result, 200);
    } catch (error) {
      next(error);
    }
  }

  static async markAsRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user!.userId;
      const idParam = req.params.id;
      const notificationId = Array.isArray(idParam) ? idParam[0] : idParam;

      const notification = await NotificationService.markAsRead(notificationId, userId);

      sendSuccess(res, { notification }, 200);
    } catch (error) {
      next(error);
    }
  }

  static async markAllAsRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user!.userId;
      const result = await NotificationService.markAllAsRead(userId);

      sendSuccess(res, result, 200);
    } catch (error) {
      next(error);
    }
  }
}
