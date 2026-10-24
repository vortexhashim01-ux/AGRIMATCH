import { z } from 'zod';

const locationSchema = z.object({
  address: z.string().max(255).optional(),
  state: z.string().max(100).optional(),
  district: z.string().max(100).optional(),
  pincode: z
    .string()
    .regex(/^\d{6}$/, 'Pincode must be 6 digits')
    .optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

export const buyerRequirementSchema = z.object({
  body: z.object({
    cropName: z.string().min(1).max(100).trim(),
    quantityKg: z.number().min(0.01),
    maxPricePerKg: z.number().min(0),
    qualityGrade: z.enum(['A', 'B', 'C']).optional(),
    requiredByDate: z.coerce.date().optional(),
    location: locationSchema.optional(),
  }),
});

export const buyerRequirementUpdateSchema = z.object({
  body: buyerRequirementSchema.shape.body.partial(),
});

export const buyerRequirementStatusSchema = z.object({
  body: z.object({
    status: z.enum(['open', 'matched', 'fulfilled', 'expired']),
  }),
});

export const buyerRequirementQuerySchema = z.object({
  cropName: z.string().min(1).optional(),
  minPricePerKg: z.coerce.number().min(0).optional(),
  maxPricePerKg: z.coerce.number().min(0).optional(),
  qualityGrade: z.enum(['A', 'B', 'C']).optional(),
  state: z.string().min(1).optional(),
  district: z.string().min(1).optional(),
  status: z.enum(['open', 'matched', 'fulfilled', 'expired']).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export type BuyerRequirementInput = z.infer<typeof buyerRequirementSchema>['body'];
export type BuyerRequirementUpdateInput = z.infer<typeof buyerRequirementUpdateSchema>['body'];
export type BuyerRequirementQuery = z.infer<typeof buyerRequirementQuerySchema>;
