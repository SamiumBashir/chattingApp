import { Router } from 'express';
import {
  getConversationMessages,
  sendMessage,
  markMessageRead,
  editMessage,
  deleteMessage,
  addReaction,
  removeReaction,
  searchMessages,
} from './messages.controller.js';
import { authenticate } from '../../middlewares/auth.js';
import { validateRequest } from '../../middlewares/validate.js';
import {
  getMessagesSchema,
  sendMessageSchema,
} from '../../validators/message.validator.js';
import {
  editMessageSchema,
  reactionSchema,
} from '../../validators/messageExperience.validator.js';

const router = Router();

// Endpoints with per-route authentication
router.get('/messages/search', authenticate, searchMessages);
router.get(
  '/conversations/:id/messages',
  authenticate,
  validateRequest({ query: getMessagesSchema }),
  getConversationMessages
);
router.post(
  '/conversations/:id/messages',
  authenticate,
  validateRequest({ body: sendMessageSchema.omit({ conversationId: true }) }),
  sendMessage
);
router.post('/messages/:id/read', authenticate, markMessageRead);
router.patch('/messages/:id', authenticate, validateRequest({ body: editMessageSchema }), editMessage);
router.delete('/messages/:id', authenticate, deleteMessage);
router.post('/messages/:id/reactions', authenticate, validateRequest({ body: reactionSchema }), addReaction);
router.delete('/messages/:id/reactions', authenticate, removeReaction);

export default router;
