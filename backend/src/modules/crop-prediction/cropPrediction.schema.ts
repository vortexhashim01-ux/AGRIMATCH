import { z } from 'zod';

const ObjectIdRegex = /^[0-9a-fA-F]{24}$/;

export const generatePredictionSchema = z.object({
  body: z
    .object({
      cropName: z.string().min(2).max(50),
      cropVariety: z.string().max(100).optional(),
      farmProfileId: z.string().regex(ObjectIdRegex).optional(),
      location: z
        .object({
          state: z.string().min(1).max(60),
          district: z.string().min(1).max(60),
        })
        .optional(),
      farmSizeAcres: z.coerce.number().positive(),
      qualityGrade: z
        .enum(['Premium', 'Standard', 'Economy'])
        .default('Standard'),
      estimatedYieldQty: z.coerce.number().positive().optional(),
      expectedPricePerUnit: z.coerce.number().positive().optional(),
      estimatedTotalCost: z.coerce.number().min(0).optional(),
      limitRecommendedBuyers: z.coerce
        .number()
        .int()
        .min(1)
        .max(20)
        .default(10),
    })
    .superRefine((val, ctx) => {
      if (!val.farmProfileId && !val.location) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Either farmProfileId or location (state/district) must be provided',
          path: ['location'],
        });
      }
    }),
});

export const predictionQuerySchema = z.object({
  status: z.enum(['active', 'deleted']).default('active'),
  cropName: z.string().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  sort: z.enum(['newest', 'oldest']).default('newest'),
});

export const objectIdParamsSchema = z.object({
  id: z.string().regex(ObjectIdRegex),
});

export type GeneratePredictionInput = z.infer<
  typeof generatePredictionSchema.shape.body
>;

export type PredictionQuery = z.infer<typeof predictionQuerySchema>;
