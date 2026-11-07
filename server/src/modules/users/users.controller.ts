import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types/index.js';
import { UserService } from '../../services/user.service.js';
import { sendSuccess } from '../../utils/apiResponse.js';

export const getMe = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const profile = await UserService.getProfile(req.user!.userId);
    sendSuccess(res, { user: profile });
  } catch (error) {
    next(error);
  }
};

export const updateMe = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const updated = await UserService.updateProfile(req.user!.userId, req.body);
    sendSuccess(res, { user: updated });
  } catch (error) {
    next(error);
  }
};

export const searchUsers = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const query = (req.query.q as string) || '';
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
    const users = await UserService.searchUsers(req.user!.userId, query, limit);
    sendSuccess(res, { users });
  } catch (error) {
    next(error);
  }
};

export const getUserById = async (
  _req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = Array.isArray(_req.params.userId) ? _req.params.userId[0] : _req.params.userId;
    const profile = await UserService.getProfile(userId);
    sendSuccess(res, { user: profile });
  } catch (error) {
    next(error);
  }
};

export const blockUser = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const targetUserId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
    const result = await UserService.blockUser(req.user!.userId, targetUserId);
    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
};

export const unblockUser = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const targetUserId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
    const result = await UserService.unblockUser(req.user!.userId, targetUserId);
    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
};

export const getBlockedUsers = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const blockedUsers = await UserService.getBlockedUsers(req.user!.userId);
    sendSuccess(res, { blockedUsers });
  } catch (error) {
    next(error);
  }
};

export const deactivateAccount = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await UserService.deactivateAccount(req.user!.userId, req.body.password);
    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
};

export const deleteAccount = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await UserService.deleteAccount(req.user!.userId, req.body.password);
    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
};

