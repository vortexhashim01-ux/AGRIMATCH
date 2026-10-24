import { z } from 'zod';

const ObjectIdRegex = /^[0-9a-fA-F]{24}$/;
const objectIdParam = z.string().regex(ObjectIdRegex, 'Invalid id');

export const threadParamsSchema = z.object({
  threadId: objectIdParam,
});

export const openThreadSchema = z.object({
  body: z.object({
    matchId: objectIdParam,
  }),
});

export const sendMessageSchema = z.object({
  body: z.object({
    content: z.string().min(1).max(1000).trim(),
    contentType: z.enum(['text', 'voice']).optional().default('text'),
    audioUrl: z.string().url().max(500).optional(),
  }),
});

export const messageListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  before: z.coerce.date().optional(),
});

export type OpenThreadInput = z.infer<typeof openThreadSchema>['body'];
export type SendMessageInput = z.infer<typeof sendMessageSchema>['body'];
export type MessageListQuery = z.infer<typeof messageListQuerySchema>;
