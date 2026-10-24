import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

export const scanIdParamsSchema = z.object({
  id: z.string().regex(objectIdRegex, 'Invalid id'),
});

export const scanListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
  // `z.coerce.boolean()` would treat the string "false" as true, because any
  // non-empty string is truthy. Parse the query-string value explicitly.
  unresolvedOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

export const diagnoseSchema = z.object({
  body: z.object({
    cropName: z.string().min(1).max(100).trim().optional(),
  }),
});

export type ScanListQuery = z.infer<typeof scanListQuerySchema>;
export type DiagnoseInput = z.infer<typeof diagnoseSchema>['body'];
