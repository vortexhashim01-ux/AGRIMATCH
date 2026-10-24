import { z } from 'zod';

export const marketPriceQuerySchema = z.object({
  commodity: z.string().min(2).max(60).trim(),
  district: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  days: z.coerce.number().int().min(1).max(30).optional().default(7),
});

export type MarketPriceQuery = z.infer<typeof marketPriceQuerySchema>;
