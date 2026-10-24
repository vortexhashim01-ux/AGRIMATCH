import { Router } from 'express';
import * as authController from './auth.controller';
import { validate } from '../../middleware/validate';
import {
  registerSchema,
  loginWithPasswordSchema,
  requestOTPSchema,
  verifyOTPSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from './auth.schema';
import { requireAuth } from '../../middleware/requireAuth';

const router = Router();

router.post(
  '/register',
  validate({ body: registerSchema.shape.body }),
  authController.register
);

router.post(
  '/login/password',
  validate({ body: loginWithPasswordSchema.shape.body }),
  authController.loginWithPassword
);

router.post(
  '/otp/request',
  validate({ body: requestOTPSchema.shape.body }),
  authController.requestOTP
);

router.post(
  '/otp/verify',
  validate({ body: verifyOTPSchema.shape.body }),
  authController.verifyOTP
);

router.post(
  '/forgot-password',
  validate({ body: forgotPasswordSchema.shape.body }),
  authController.forgotPassword
);

router.post(
  '/reset-password',
  validate({ body: resetPasswordSchema.shape.body }),
  authController.resetPassword
);

router.post('/select-role', requireAuth, authController.selectRole);
router.post('/demo-login', authController.demoLogin);
router.post('/refresh', authController.refreshToken);
// Deliberately not behind `requireAuth`: an expired access token must still be
// able to end the session and clear the refresh cookie.
router.post('/logout', authController.logout);
router.get('/me', requireAuth, authController.getMe);

export default router;
