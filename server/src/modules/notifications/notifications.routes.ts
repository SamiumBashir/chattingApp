import { Router } from 'express';
import { NotificationController } from './notifications.controller.js';
import { authenticate } from '../../middlewares/auth.js';

const router = Router();

// Protect all notification routes
router.use(authenticate);

router.get('/', NotificationController.getNotifications);
router.patch('/:id/read', NotificationController.markAsRead);
router.post('/read-all', NotificationController.markAllAsRead);

export default router;
