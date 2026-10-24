import { z } from 'zod';

export const notificationQuerySchema = z.object({
  // Zod's `coerce.boolean` would turn the string "false" into `true`.
  unreadOnly: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).optional(),
});

export type NotificationQuery = z.infer<typeof notificationQuerySchema>;
