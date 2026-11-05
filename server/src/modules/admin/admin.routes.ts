import { Router } from 'express';
import { AdminController } from './admin.controller.js';
import { authenticate, requireRole } from '../../middlewares/auth.js';
import { validateRequest } from '../../middlewares/validate.js';
import {
  updateUserStatusSchema,
  updateReportSchema,
  createReportSchema,
} from '../../validators/admin.validator.js';

const router = Router();

// Endpoint for any authenticated user to file a moderation report
router.post(
  '/reports',
  authenticate,
  validateRequest({ body: createReportSchema }),
  AdminController.createReport
);

// All subsequent admin management endpoints require role 'admin' or 'superadmin'
router.use(authenticate, requireRole('admin', 'superadmin'));

router.get('/overview', AdminController.getOverview);
router.get('/users', AdminController.getUsers);
router.patch(
  '/users/:id/status',
  validateRequest({ body: updateUserStatusSchema }),
  AdminController.updateUserStatus
);
router.get('/reports', AdminController.getReports);
router.patch(
  '/reports/:id',
  validateRequest({ body: updateReportSchema }),
  AdminController.updateReport
);
router.get('/audit-logs', AdminController.getAuditLogs);

export default router;

