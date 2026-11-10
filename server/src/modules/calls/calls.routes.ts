import { Router } from 'express';
import {
  getIceServers,
  getCallHistory,
  getConversationCalls,
  getCallDetails,
  submitCallRating,
} from './calls.controller.js';
import { authenticate } from '../../middlewares/auth.js';

const router = Router();

// Require authenticated session for all call management & history routes
router.use(authenticate);

// GET /api/v1/calls/ice-servers
router.get('/ice-servers', getIceServers);

// GET /api/v1/calls/history
router.get('/history', getCallHistory);

// GET /api/v1/calls/conversations/:id
router.get('/conversations/:id', getConversationCalls);

// GET /api/v1/calls/:id
router.get('/:id', getCallDetails);

// POST /api/v1/calls/:id/rating
router.post('/:id/rating', submitCallRating);

export default router;
