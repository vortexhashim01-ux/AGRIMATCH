import { z } from 'zod';
import { FarmSize, FarmingMethod, WaterSource } from './farmProfile.model';

export const farmProfileSchema = z.object({
  body: z.object({
    farmName: z.string().max(200).optional().or(z.literal('')),
    addressLine1: z.string().min(1).max(255).trim(),
    addressLine2: z.string().max(255).optional().or(z.literal('')),
    city: z.string().min(1).max(100).trim(),
    district: z.string().min(1).max(100).trim(),
    state: z.string().min(1).max(100).trim(),
    pincode: z.string().regex(/^\d{6}$/, 'Pincode must be 6 digits'),
    country: z.string().min(1).max(100).trim().default('India'),
    totalLandArea: z.number().min(0.01),
    landUnit: z.enum(['acre', 'hectare', 'bigha', 'guntha']).default('acre'),
    farmSize: z.enum(['micro', 'small', 'medium', 'large', 'very_large'] as const satisfies readonly FarmSize[]),
    farmingMethod: z.enum(['organic', 'conventional', 'mixed', 'natural'] as const satisfies readonly FarmingMethod[]),
    certificationType: z.string().max(100).optional().or(z.literal('')),
    certificationNumber: z.string().max(100).optional().or(z.literal('')),
    waterSources: z.array(z.enum(['rainfed', 'well', 'canal', 'borewell', 'river', 'tank', 'drip'] as const satisfies readonly WaterSource[])).default([]),
    numberOfWorkers: z.number().min(0).int().optional(),
    experienceYears: z.number().min(0).max(100).int().optional(),
    primaryCrops: z.array(z.string().trim()).default([]),
    isActive: z.boolean().default(true),
  }),
});

export type FarmProfileInput = z.infer<typeof farmProfileSchema>['body'];
