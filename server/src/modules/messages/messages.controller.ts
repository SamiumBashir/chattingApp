import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types/index.js';
import { MessageService } from '../../services/message.service.js';
import { sendSuccess } from '../../utils/apiResponse.js';

export const getConversationMessages = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const conversationId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const cursor = req.query.cursor as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;

    const result = await MessageService.getMessages(
      conversationId,
      req.user!.userId,
      cursor,
      limit
    );

    sendSuccess(res, { messages: result.messages }, 200, {
      ...result.meta,
      nextCursor: result.meta.nextCursor ?? undefined,
    });
  } catch (error) {
    next(error);
  }
};

export const sendMessage = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const conversationId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const result = await MessageService.sendMessage(req.user!.userId, {
      ...req.body,
      conversationId,
    });

    sendSuccess(res, { message: result.message }, 201);
  } catch (error) {
    next(error);
  }
};

export const markMessageRead = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const messageId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    await MessageService.markRead(messageId, req.user!.userId);
    sendSuccess(res, { success: true });
  } catch (error) {
    next(error);
  }
};

export const editMessage = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const messageId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const updated = await MessageService.editMessage(messageId, req.user!.userId, req.body.content);
    sendSuccess(res, { message: updated });
  } catch (error) {
    next(error);
  }
};

export const deleteMessage = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const messageId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const result = await MessageService.deleteMessage(messageId, req.user!.userId);
    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
};

export const addReaction = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const messageId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const result = await MessageService.addReaction(messageId, req.user!.userId, req.body.emoji);
    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
};

export const removeReaction = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const messageId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const result = await MessageService.removeReaction(messageId, req.user!.userId);
    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
};

export const searchMessages = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const q = (req.query.q as string) || '';
    const conversationId = req.query.conversationId as string | undefined;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

    const result = await MessageService.searchMessages(req.user!.userId, q, {
      conversationId,
      page,
      limit,
    });

    sendSuccess(res, result, 200);
  } catch (error) {
    next(error);
  }
};
