import { Router } from 'express';
import * as notificationController from './notification.controller';
import { validate } from '../../middleware/validate';
import { notificationQuerySchema } from './notification.schema';
import { requireAuth } from '../../middleware/requireAuth';

const router = Router();

router.use(requireAuth);

router.get(
  '/',
  validate({ query: notificationQuerySchema }),
  notificationController.listNotifications
);

router.post('/read-all', notificationController.markAllRead);
router.post('/:id/read', notificationController.markRead);

export default router;
