import { z } from 'zod';

export const marketplaceQuerySchema = z.object({
  cropName: z.string().max(80).optional(),
  state: z.string().max(60).optional(),
  district: z.string().max(60).optional(),
  type: z.enum(['listing', 'requirement', 'all']).default('all'),
  minPrice: z.coerce.number().positive().optional(),
  maxPrice: z.coerce.number().positive().optional(),
  qualityGrade: z.string().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40),
  sort: z.enum(['newest', 'priceAsc', 'priceDesc']).default('newest'),
});

export type MarketplaceQuery = z.infer<typeof marketplaceQuerySchema>;
