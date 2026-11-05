import { Request, Response, NextFunction } from 'express';
import { AdminService } from '../../services/admin.service.js';
import { sendSuccess } from '../../utils/apiResponse.js';

export class AdminController {
  static async getOverview(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const overview = await AdminService.getOverview();
      sendSuccess(res, overview, 200);
    } catch (error) {
      next(error);
    }
  }

  static async getUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const status = req.query.status as string | undefined;
      const role = req.query.role as string | undefined;
      const q = req.query.q as string | undefined;

      const result = await AdminService.getUsers({ page, limit, status, role, q });
      sendSuccess(res, result, 200);
    } catch (error) {
      next(error);
    }
  }

  static async updateUserStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const idParam = req.params.id;
      const targetUserId = Array.isArray(idParam) ? idParam[0] : idParam;
      const actorId = (req as any).user!.userId;
      const { status, reason } = req.body;

      const updated = await AdminService.updateUserStatus(
        targetUserId,
        status,
        actorId,
        reason,
        req.ip,
        req.get('user-agent')
      );

      sendSuccess(res, { user: updated }, 200);
    } catch (error) {
      next(error);
    }
  }

  static async createReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const reporterId = (req as any).user!.userId;
      const report = await AdminService.createReport(reporterId, req.body);
      sendSuccess(res, { report }, 201);
    } catch (error) {
      next(error);
    }
  }

  static async getReports(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const status = req.query.status as string | undefined;

      const result = await AdminService.getReports({ page, limit, status });
      sendSuccess(res, result, 200);
    } catch (error) {
      next(error);
    }
  }

  static async updateReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const idParam = req.params.id;
      const reportId = Array.isArray(idParam) ? idParam[0] : idParam;
      const reviewerId = (req as any).user!.userId;

      const updated = await AdminService.updateReport(
        reportId,
        req.body,
        reviewerId,
        req.ip,
        req.get('user-agent')
      );

      sendSuccess(res, { report: updated }, 200);
    } catch (error) {
      next(error);
    }
  }

  static async getAuditLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const action = req.query.action as string | undefined;
      const actorId = req.query.actorId as string | undefined;

      const result = await AdminService.getAuditLogs({ page, limit, action, actorId });
      sendSuccess(res, result, 200);
    } catch (error) {
      next(error);
    }
  }
}

