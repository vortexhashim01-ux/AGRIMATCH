import { Router } from 'express';
import * as userController from './user.controller';
import { validate } from '../../middleware/validate';
import {
  listUsersQuerySchema,
  updatePreferencesSchema,
  userIdParamsSchema,
  userStatusSchema,
} from './user.schema';
import { requireAuth } from '../../middleware/requireAuth';
import { roleGuard } from '../../middleware/roleGuard';

const router = Router();

router.use(requireAuth);

router.get(
  '/',
  validate({ query: listUsersQuerySchema }),
  userController.listUsers
);

// Registered before `/:id/status` so the literal segment wins the match.
router.patch(
  '/me/preferences',
  validate({ body: updatePreferencesSchema.shape.body }),
  userController.updateMyPreferences
);

// Data portability and account deletion (PRD §12). Both act on the caller's own
// account, so neither needs a role guard.
router.get('/me/export', userController.exportMyData);

router.delete('/me', userController.deleteMyAccount);

router.patch(
  '/:id/status',
  roleGuard('admin'),
  validate({ params: userIdParamsSchema, body: userStatusSchema.shape.body }),
  userController.setUserStatus
);

export default router;
