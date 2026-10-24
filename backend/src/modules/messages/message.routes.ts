import { Router } from 'express';
import * as messageController from './message.controller';
import { validate } from '../../middleware/validate';
import {
  messageListQuerySchema,
  openThreadSchema,
  sendMessageSchema,
  threadParamsSchema,
} from './message.schema';
import { requireAuth } from '../../middleware/requireAuth';

const router = Router();

router.use(requireAuth);

router.get('/threads', messageController.listThreads);

router.post(
  '/threads',
  validate({ body: openThreadSchema.shape.body }),
  messageController.openThread
);

router.get(
  '/threads/:threadId/messages',
  validate({ params: threadParamsSchema, query: messageListQuerySchema }),
  messageController.listMessages
);

router.post(
  '/threads/:threadId/messages',
  validate({ params: threadParamsSchema, body: sendMessageSchema.shape.body }),
  messageController.sendMessage
);

export default router;
