import { z } from 'zod';
import type { MatchStatus } from './matching.model';

const ObjectIdRegex = /^[0-9a-fA-F]{24}$/;
const objectIdParam = z.string().regex(ObjectIdRegex, 'Invalid id');

export const matchIdParamsSchema = z.object({
  id: objectIdParam,
});

export const runForListingSchema = z.object({
  params: z.object({
    listingId: objectIdParam,
  }),
  body: z
    .object({
      threshold: z.coerce.number().min(0).max(100).optional().default(60),
      limitMatches: z.coerce.number().int().min(1).max(20).optional().default(10),
    })
    .optional()
    .default({ threshold: 60, limitMatches: 10 }),
});

export const runForRequirementSchema = z.object({
  params: z.object({
    requirementId: objectIdParam,
  }),
  body: z
    .object({
      threshold: z.coerce.number().min(0).max(100).optional().default(60),
      limitMatches: z.coerce.number().int().min(1).max(20).optional().default(10),
    })
    .optional()
    .default({ threshold: 60, limitMatches: 10 }),
});

const validStatuses: readonly [MatchStatus, ...MatchStatus[]] = [
  'suggested',
  'pending',
  'accepted',
  'rejected',
  'expired',
];

export const matchingQuerySchema = z.object({
  status: z.enum(validStatuses).optional(),
  role: z.enum(['farmer', 'buyer']).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export const rejectMatchSchema = z.object({
  body: z.object({
    reason: z.string().min(1).max(255).trim().optional(),
  }),
});

export type RunForListingInput = z.infer<typeof runForListingSchema>['body'];
export type RunForRequirementInput = z.infer<
  typeof runForRequirementSchema
>['body'];
export type MatchingQuery = z.infer<typeof matchingQuerySchema>;
export type RejectMatchInput = z.infer<typeof rejectMatchSchema>['body'];
