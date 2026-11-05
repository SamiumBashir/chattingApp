import { Router } from 'express';
import {
  getMe,
  updateMe,
  searchUsers,
  getUserById,
  blockUser,
  unblockUser,
  getBlockedUsers,
} from './users.controller.js';
import { authenticate } from '../../middlewares/auth.js';
import { validateRequest } from '../../middlewares/validate.js';
import { updateProfileSchema, searchUsersSchema } from '../../validators/user.validator.js';

const router = Router();

router.use(authenticate);

router.get('/me', getMe);
router.patch('/me', validateRequest({ body: updateProfileSchema }), updateMe);
router.get('/search', validateRequest({ query: searchUsersSchema }), searchUsers);
router.get('/blocked', getBlockedUsers);
router.get('/:userId', getUserById);
router.post('/:userId/block', blockUser);
router.delete('/:userId/block', unblockUser);

export default router;

