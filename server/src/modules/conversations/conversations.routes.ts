import { Router } from 'express';
import {
  listConversations,
  createPrivateConversation,
  createGroupConversation,
  getConversation,
  updateGroup,
  deleteConversation,
  addMembers,
  removeMember,
  leaveGroup,
  markConversationRead,
} from './conversations.controller.js';
import { getConversationCalls } from '../calls/calls.controller.js';
import { authenticate } from '../../middlewares/auth.js';
import { validateRequest } from '../../middlewares/validate.js';
import {
  createPrivateConversationSchema,
  createGroupConversationSchema,
  updateGroupSchema,
  addMembersSchema,
} from '../../validators/conversation.validator.js';

const router = Router();

router.use(authenticate);

router.get('/', listConversations);
router.post('/private', validateRequest({ body: createPrivateConversationSchema }), createPrivateConversation);
router.post('/group', validateRequest({ body: createGroupConversationSchema }), createGroupConversation);
router.get('/:id', getConversation);
router.get('/:id/calls', getConversationCalls);
router.patch('/:id', validateRequest({ body: updateGroupSchema }), updateGroup);
router.delete('/:id', deleteConversation);
router.post('/:id/members', validateRequest({ body: addMembersSchema }), addMembers);
router.delete('/:id/members/:userId', removeMember);
router.post('/:id/leave', leaveGroup);
router.post('/:id/read', markConversationRead);

export default router;

