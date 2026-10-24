import { Schema, model, Types } from 'mongoose';

export type FarmSize = 'micro' | 'small' | 'medium' | 'large' | 'very_large';
export type FarmingMethod = 'organic' | 'conventional' | 'mixed' | 'natural';
export type WaterSource = 'rainfed' | 'well' | 'canal' | 'borewell' | 'river' | 'tank' | 'drip';

export interface IFarmProfile {
  _id: Types.ObjectId;
  farmerId: Types.ObjectId;
  farmName?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
  country: string;
  totalLandArea: number;
  landUnit: 'acre' | 'hectare' | 'bigha' | 'guntha';
  farmSize: FarmSize;
  farmingMethod: FarmingMethod;
  certificationType?: string;
  certificationNumber?: string;
  waterSources: WaterSource[];
  numberOfWorkers?: number;
  experienceYears?: number;
  primaryCrops: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const farmProfileSchema = new Schema<IFarmProfile>(
  {
    farmerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
      unique: true,
    },
    farmName: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    addressLine1: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    addressLine2: {
      type: String,
      trim: true,
      maxlength: 255,
    },
    city: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
      index: true,
    },
    district: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
      index: true,
    },
    state: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
      index: true,
    },
    pincode: {
      type: String,
      required: true,
      trim: true,
      length: 6,
      match: [/^\d{6}$/, 'Pincode must be 6 digits'],
    },
    country: {
      type: String,
      required: true,
      trim: true,
      default: 'India',
    },
    totalLandArea: {
      type: Number,
      required: true,
      min: 0.01,
    },
    landUnit: {
      type: String,
      enum: ['acre', 'hectare', 'bigha', 'guntha'],
      default: 'acre',
    },
    farmSize: {
      type: String,
      enum: ['micro', 'small', 'medium', 'large', 'very_large'],
      required: true,
    },
    farmingMethod: {
      type: String,
      enum: ['organic', 'conventional', 'mixed', 'natural'],
      required: true,
      index: true,
    },
    certificationType: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    certificationNumber: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    waterSources: {
      type: [
        {
          type: String,
          enum: ['rainfed', 'well', 'canal', 'borewell', 'river', 'tank', 'drip'],
        },
      ],
      default: [],
    },
    numberOfWorkers: {
      type: Number,
      min: 0,
    },
    experienceYears: {
      type: Number,
      min: 0,
      max: 100,
    },
    primaryCrops: {
      type: [{ type: String, trim: true }],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

farmProfileSchema.index({ farmerId: 1, isActive: 1 });
farmProfileSchema.index({ state: 1, district: 1 });
farmProfileSchema.index({ farmingMethod: 1, farmSize: 1 });

export const FarmProfile = model<IFarmProfile>('FarmProfile', farmProfileSchema);
