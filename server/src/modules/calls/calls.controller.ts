import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types/index.js';
import { CallService } from '../../services/call.service.js';
import { CallPersistenceService } from '../../services/callPersistence.service.js';
import { Conversation } from '../../models/Conversation.js';
import { sendSuccess, AppError } from '../../utils/apiResponse.js';
import { CallType, CallStatus } from '../../models/Call.js';

/**
 * Returns authenticated, short-lived ICE servers configuration (STUN & TURN)
 * GET /api/v1/calls/ice-servers
 */
export const getIceServers = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const iceConfig = await CallService.getIceServers(req.user!.userId);
    sendSuccess(res, iceConfig);
  } catch (error) {
    next(error);
  }
};

/**
 * Returns paginated call history for the authenticated user
 * GET /api/v1/calls/history
 */
export const getCallHistory = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
    const callType = req.query.callType as CallType | undefined;
    const status = req.query.status as CallStatus | undefined;

    const result = await CallPersistenceService.getUserCallHistory(req.user!.userId, {
      page,
      limit,
      callType,
      status,
    });

    sendSuccess(res, { calls: result.calls }, 200, result.pagination);
  } catch (error) {
    next(error);
  }
};

/**
 * Returns paginated call logs for a specific conversation
 * GET /api/v1/calls/conversations/:id or GET /api/v1/conversations/:id/calls
 */
export const getConversationCalls = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const conversationId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      throw new AppError('Conversation not found', 404, 'NOT_FOUND');
    }

    if (!conversation.hasParticipant(req.user!.userId) && req.user!.role !== 'admin') {
      throw new AppError('You are not authorized to view call logs for this conversation', 403, 'FORBIDDEN');
    }

    const result = await CallPersistenceService.getConversationCallHistory(conversationId, {
      page,
      limit,
    });

    sendSuccess(res, { calls: result.calls }, 200, result.pagination);
  } catch (error) {
    next(error);
  }
};

/**
 * Returns details for a single call record
 * GET /api/v1/calls/:id
 */
export const getCallDetails = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const callIdentifier = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const call = await CallPersistenceService.getCallById(callIdentifier);

    if (!call) {
      throw new AppError('Call record not found', 404, 'NOT_FOUND');
    }

    const callerId = (call.caller as any)?._id?.toString() || call.caller?.toString();
    const recipientId = (call.recipient as any)?._id?.toString() || call.recipient?.toString();
    const currentUserId = req.user!.userId;

    const isAuthorized =
      callerId === currentUserId ||
      recipientId === currentUserId ||
      req.user!.role === 'admin';

    if (!isAuthorized) {
      throw new AppError('You do not have permission to access this call record', 403, 'FORBIDDEN');
    }

    sendSuccess(res, { call });
  } catch (error) {
    next(error);
  }
};

/**
 * Submits quality rating and qualitative feedback for a completed call
 * POST /api/v1/calls/:id/rating
 */
export const submitCallRating = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const callIdentifier = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { rating, feedback, tags } = req.body;

    if (typeof rating !== 'number' || rating < 1 || rating > 5) {
      throw new AppError('Rating must be an integer between 1 and 5', 400, 'VALIDATION_ERROR');
    }

    const call = await CallPersistenceService.getCallById(callIdentifier);
    if (!call) {
      throw new AppError('Call record not found', 404, 'NOT_FOUND');
    }

    const callerId = (call.caller as any)?._id?.toString() || call.caller?.toString();
    const recipientId = (call.recipient as any)?._id?.toString() || call.recipient?.toString();
    const currentUserId = req.user!.userId;

    const isAuthorized =
      callerId === currentUserId ||
      recipientId === currentUserId ||
      req.user!.role === 'admin';

    if (!isAuthorized) {
      throw new AppError('You are not authorized to submit feedback for this call', 403, 'FORBIDDEN');
    }

    const updatedCall = await CallPersistenceService.submitRating(callIdentifier, {
      rating: Math.round(rating),
      feedback: typeof feedback === 'string' ? feedback.trim() : undefined,
      tags: Array.isArray(tags) ? tags.map((t) => String(t).trim()).filter(Boolean) : undefined,
      ratedBy: currentUserId,
    });

    sendSuccess(res, { call: updatedCall }, 200);
  } catch (error) {
    next(error);
  }
};
