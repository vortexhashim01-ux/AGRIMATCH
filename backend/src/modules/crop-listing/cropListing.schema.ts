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

export const cropListingSchema = z.object({
  body: z.object({
    cropName: z.string().min(1).max(100).trim(),
    quantityKg: z.number().min(0.01),
    expectedPricePerKg: z.number().min(0),
    qualityGrade: z.enum(['A', 'B', 'C']).optional(),
    harvestDate: z.coerce.date().optional(),
    location: locationSchema.optional(),
  }),
});

export const cropListingUpdateSchema = z.object({
  body: cropListingSchema.shape.body.partial(),
});

export const cropListingStatusSchema = z.object({
  body: z.object({
    status: z.enum(['active', 'matched', 'sold', 'expired']),
  }),
});

export const cropListingQuerySchema = z.object({
  cropName: z.string().min(1).optional(),
  minPricePerKg: z.coerce.number().min(0).optional(),
  maxPricePerKg: z.coerce.number().min(0).optional(),
  qualityGrade: z.enum(['A', 'B', 'C']).optional(),
  state: z.string().min(1).optional(),
  district: z.string().min(1).optional(),
  status: z.enum(['active', 'matched', 'sold', 'expired']).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export type CropListingInput = z.infer<typeof cropListingSchema>['body'];
export type CropListingUpdateInput = z.infer<typeof cropListingUpdateSchema>['body'];
export type CropListingQuery = z.infer<typeof cropListingQuerySchema>;
