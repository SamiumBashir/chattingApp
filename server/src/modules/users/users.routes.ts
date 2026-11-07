import { Router } from 'express';
import {
  getMe,
  updateMe,
  searchUsers,
  getUserById,
  blockUser,
  unblockUser,
  getBlockedUsers,
  deactivateAccount,
  deleteAccount,
} from './users.controller.js';
import { authenticate } from '../../middlewares/auth.js';
import { validateRequest } from '../../middlewares/validate.js';
import { updateProfileSchema, searchUsersSchema, confirmPasswordSchema } from '../../validators/user.validator.js';

const router = Router();

router.use(authenticate);

router.get('/me', getMe);
router.patch('/me', validateRequest({ body: updateProfileSchema }), updateMe);
router.post('/deactivate', validateRequest({ body: confirmPasswordSchema }), deactivateAccount);
router.post('/delete-account', validateRequest({ body: confirmPasswordSchema }), deleteAccount);
router.get('/search', validateRequest({ query: searchUsersSchema }), searchUsers);
router.get('/blocked', getBlockedUsers);
router.get('/:userId', getUserById);
router.post('/:userId/block', blockUser);
router.delete('/:userId/block', unblockUser);

export default router;

