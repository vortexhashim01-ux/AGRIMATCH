import { z } from 'zod';

const ObjectIdRegex = /^[0-9a-fA-F]{24}$/;

const locationPartSchema = z.object({
  state: z.string().min(2).max(100).trim(),
  district: z.string().min(2).max(100).trim(),
  pincode: z.string().regex(/^\d{6}$/, 'Pincode must be 6 digits').optional(),
});

export const cropRecommendationIdParamsSchema = z.object({
  id: z.string().regex(ObjectIdRegex, 'Invalid id'),
});

export const generateCropRecommendationSchema = z.object({
  body: z.object({
    farmProfileId: z.string().regex(ObjectIdRegex, 'Invalid farm profile id'),
    totalLandArea: z.number().min(0.01),
    landUnit: z.enum(['acre', 'hectare', 'bigha', 'guntha']).default('acre'),
    soilType: z.enum([
      'alluvial',
      'black',
      'red',
      'laterite',
      'desert',
      'mountain',
      'peat',
      'saline',
    ]),
    season: z.enum([
      'kharif',
      'rabi',
      'zaid',
      'summer',
      'winter',
      'whole_year',
    ]),
    location: locationPartSchema,
    soilPH: z.number().min(0).max(14).optional(),
    soilNitrogen: z.number().min(0).optional(),
    soilPhosphorus: z.number().min(0).optional(),
    soilPotassium: z.number().min(0).optional(),
    soilOrganicMatter: z.number().min(0).max(100).optional(),
    climateZone: z.string().min(1).max(100).optional(),
    averageRainfallMm: z.number().min(0).optional(),
    irrigationType: z
      .enum([
        'rainfed',
        'canal',
        'borewell',
        'drip',
        'sprinkler',
        'tank',
        'well',
      ])
      .optional(),
    irrigationFrequencyPerWeek: z.number().min(0).max(21).optional(),
    previousCrop: z.string().max(100).optional(),
    budgetPerAcre: z.number().min(0).optional(),
    cropPreferences: z.array(z.string().min(1)).optional(),
    avoidCrops: z.array(z.string().min(1)).optional(),
    isOrganicPreferred: z.boolean().optional(),
    expectedSellingPricePerKg: z.number().min(0).optional(),
  }),
});

export const cropRecommendationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export type GenerateCropRecommendationInput = z.infer<
  typeof generateCropRecommendationSchema
>['body'];
export type CropRecommendationQuery = z.infer<
  typeof cropRecommendationQuerySchema
>;
