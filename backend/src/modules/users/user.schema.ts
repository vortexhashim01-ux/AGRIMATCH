import { z } from 'zod';
import { ACCENT_PRESETS, UserRole } from './user.model';

export const updatePreferencesSchema = z.object({
  body: z.object({
    themeMode: z.enum(['light', 'dark', 'system']).optional(),
    accentColor: z.enum(ACCENT_PRESETS).optional(),
    largeText: z.boolean().optional(),
  }),
});

export type UpdatePreferencesInput = z.infer<
  typeof updatePreferencesSchema
>['body'];

const ObjectIdRegex = /^[0-9a-fA-F]{24}$/;

/** Directory query used to list farmers/buyers, e.g. a buyer browsing sellers. */
export const listUsersQuerySchema = z.object({
  role: z.enum(['farmer', 'buyer', 'admin'] as const satisfies readonly UserRole[]).optional(),
  search: z.string().trim().max(100).optional(),
  // `active` is what everyone sees; the other two are admin-only (enforced in
  // the controller) so a disabled account is never listed to a normal user.
  status: z.enum(['active', 'inactive', 'all']).default('active'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

export const userIdParamsSchema = z.object({
  id: z.string().regex(ObjectIdRegex, 'Invalid id'),
});

export const userStatusSchema = z.object({
  body: z.object({
    isActive: z.boolean(),
  }),
});

export type UserStatusInput = z.infer<typeof userStatusSchema>['body'];
