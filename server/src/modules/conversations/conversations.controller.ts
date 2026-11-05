import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types/index.js';
import { ConversationService } from '../../services/conversation.service.js';
import { sendSuccess } from '../../utils/apiResponse.js';

export const listConversations = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 30;
    const result = await ConversationService.listConversations(req.user!.userId, page, limit);
    sendSuccess(res, { conversations: result.conversations }, 200, result.meta);
  } catch (error) {
    next(error);
  }
};

export const createPrivateConversation = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const conversation = await ConversationService.getOrCreatePrivate(
      req.user!.userId,
      req.body.recipientId
    );
    sendSuccess(res, { conversation }, 201);
  } catch (error) {
    next(error);
  }
};

export const createGroupConversation = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const conversation = await ConversationService.createGroup(req.user!.userId, req.body);
    sendSuccess(res, { conversation }, 201);
  } catch (error) {
    next(error);
  }
};

export const getConversation = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const conversation = await ConversationService.getConversation(id, req.user!.userId);
    sendSuccess(res, { conversation });
  } catch (error) {
    next(error);
  }
};

export const updateGroup = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const conversation = await ConversationService.updateGroup(id, req.user!.userId, req.body);
    sendSuccess(res, { conversation });
  } catch (error) {
    next(error);
  }
};

export const deleteConversation = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const result = await ConversationService.deleteConversation(id, req.user!.userId);
    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
};

export const addMembers = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const conversation = await ConversationService.addMembers(
      id,
      req.user!.userId,
      req.body.userIds
    );
    sendSuccess(res, { conversation });
  } catch (error) {
    next(error);
  }
};

export const removeMember = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
    const conversation = await ConversationService.removeMember(id, req.user!.userId, userId);
    sendSuccess(res, { conversation });
  } catch (error) {
    next(error);
  }
};

export const leaveGroup = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const result = await ConversationService.leaveGroup(id, req.user!.userId);
    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
};

