import { Schema, model, Types } from 'mongoose';

export interface IRecommendedCrop {
  cropName: string;
  matchScore: number;
  estimatedYieldPerAcre: number;
  estimatedPricePerKg: number;
  estimatedProfitPerAcre: number;
  riskLevel: 'low' | 'medium' | 'high';
  growthDurationDays: number;
  waterRequirement: 'low' | 'medium' | 'high';
  reasons: string[];
}

export interface ICropRecommendation {
  farmerId: Types.ObjectId;
  farmProfileId: Types.ObjectId;
  state: string;
  district: string;
  pincode: string;
  totalLandArea: number;
  landUnit: 'acre' | 'hectare' | 'bigha' | 'guntha';
  soilType:
    | 'alluvial'
    | 'black'
    | 'red'
    | 'laterite'
    | 'desert'
    | 'mountain'
    | 'peat'
    | 'saline';
  soilPH: number;
  soilNitrogen: number;
  soilPhosphorus: number;
  soilPotassium: number;
  soilOrganicMatter: number;
  climateZone: string;
  averageRainfallMm: number;
  season: 'kharif' | 'rabi' | 'zaid' | 'summer' | 'winter' | 'whole_year';
  irrigationType:
    | 'rainfed'
    | 'canal'
    | 'borewell'
    | 'drip'
    | 'sprinkler'
    | 'tank'
    | 'well';
  irrigationFrequencyPerWeek: number;
  previousCrop: string;
  budgetPerAcre: number;
  cropPreferences: string[];
  avoidCrops: string[];
  isOrganicPreferred: boolean;
  expectedSellingPricePerKg?: number;
  recommendations: IRecommendedCrop[];
  aiConfidence: number;
  aiModelVersion: string;
  isRecommended: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const recommendedCropSchema = new Schema<IRecommendedCrop>(
  {
    cropName: { type: String, required: true },
    matchScore: { type: Number, required: true, min: 0, max: 100 },
    estimatedYieldPerAcre: { type: Number, required: true, min: 0 },
    estimatedPricePerKg: { type: Number, required: true, min: 0 },
    estimatedProfitPerAcre: { type: Number, required: true, min: 0 },
    riskLevel: {
      type: String,
      enum: ['low', 'medium', 'high'],
      required: true,
    },
    growthDurationDays: { type: Number, required: true, min: 1 },
    waterRequirement: {
      type: String,
      enum: ['low', 'medium', 'high'],
      required: true,
    },
    reasons: { type: [String], default: [] },
  },
  { _id: false }
);

const cropRecommendationSchema = new Schema<ICropRecommendation>(
  {
    farmerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    farmProfileId: {
      type: Schema.Types.ObjectId,
      ref: 'FarmProfile',
      required: true,
    },
    state: { type: String, required: true, index: true },
    district: { type: String, required: true, index: true },
    pincode: { type: String, required: true, match: /^\d{6}$/ },
    totalLandArea: { type: Number, required: true, min: 0.01 },
    landUnit: {
      type: String,
      enum: ['acre', 'hectare', 'bigha', 'guntha'],
      default: 'acre',
    },
    soilType: {
      type: String,
      enum: [
        'alluvial',
        'black',
        'red',
        'laterite',
        'desert',
        'mountain',
        'peat',
        'saline',
      ],
      required: true,
      index: true,
    },
    soilPH: { type: Number, required: true, min: 0, max: 14 },
    soilNitrogen: { type: Number, required: true, min: 0 },
    soilPhosphorus: { type: Number, required: true, min: 0 },
    soilPotassium: { type: Number, required: true, min: 0 },
    soilOrganicMatter: { type: Number, required: true, min: 0, max: 100 },
    climateZone: { type: String, required: true, trim: true, index: true },
    averageRainfallMm: { type: Number, required: true, min: 0 },
    season: {
      type: String,
      enum: ['kharif', 'rabi', 'zaid', 'summer', 'winter', 'whole_year'],
      required: true,
      index: true,
    },
    irrigationType: {
      type: String,
      enum: [
        'rainfed',
        'canal',
        'borewell',
        'drip',
        'sprinkler',
        'tank',
        'well',
      ],
      required: true,
    },
    irrigationFrequencyPerWeek: {
      type: Number,
      required: true,
      min: 0,
      max: 21,
    },
    previousCrop: { type: String, trim: true, default: '' },
    budgetPerAcre: { type: Number, required: true, min: 0 },
    cropPreferences: { type: [{ type: String, trim: true }], default: [] },
    avoidCrops: { type: [{ type: String, trim: true }], default: [] },
    isOrganicPreferred: { type: Boolean, default: false, index: true },
    expectedSellingPricePerKg: { type: Number, min: 0 },
    recommendations: { type: [recommendedCropSchema], default: [] },
    aiConfidence: { type: Number, min: 0, max: 100, default: 0 },
    aiModelVersion: { type: String, default: 'rule-based-v1' },
    isRecommended: { type: Boolean, default: false, index: true },
  },
  {
    timestamps: true,
  }
);

cropRecommendationSchema.index({ farmerId: 1, createdAt: -1 });
cropRecommendationSchema.index({
  state: 1,
  district: 1,
  season: 1,
  soilType: 1,
});

export const CropRecommendation = model<ICropRecommendation>(
  'CropRecommendation',
  cropRecommendationSchema
);
