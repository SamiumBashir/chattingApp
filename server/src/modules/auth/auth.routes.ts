import { Router } from 'express';
import {
  register,
  login,
  googleLogin,
  logout,
  refresh,
  getMe,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  getSessions,
  revokeSession,
} from './auth.controller.js';
import { validateRequest } from '../../middlewares/validate.js';
import { authenticate } from '../../middlewares/auth.js';
import {
  registerSchema,
  loginSchema,
  googleAuthSchema,
  verifyEmailSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../../validators/auth.validator.js';

const router = Router();

// Public Authentication Endpoints
router.post('/register', validateRequest({ body: registerSchema }), register);
router.post('/login', validateRequest({ body: loginSchema }), login);
router.post('/google', validateRequest({ body: googleAuthSchema }), googleLogin);
router.post('/refresh', refresh);
router.post('/verify-email', validateRequest({ body: verifyEmailSchema }), verifyEmail);
router.post('/forgot-password', validateRequest({ body: forgotPasswordSchema }), forgotPassword);
router.post('/reset-password', validateRequest({ body: resetPasswordSchema }), resetPassword);

// Authenticated Endpoints
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, getMe);
router.post('/resend-verification', authenticate, resendVerification);
router.get('/sessions', authenticate, getSessions);
router.delete('/sessions/:id', authenticate, revokeSession);

export default router;

