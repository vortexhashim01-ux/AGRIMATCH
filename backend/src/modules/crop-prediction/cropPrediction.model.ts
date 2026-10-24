import { Schema, model, Types, HydratedDocument } from 'mongoose';

export interface ICropPrediction {
  _id?: Types.ObjectId;
  userId: Types.ObjectId;
  farmProfileId?: Types.ObjectId;
  cropName: string;
  cropVariety?: string;
  location: {
    state: string;
    district: string;
  };
  farmSizeAcres: number;
  qualityGrade: string;
  estimatedYieldQty: number;
  yieldUnit: string;
  expectedPricePerUnit: number;
  priceCurrency: string;
  /**
   * Where `expectedPricePerUnit` came from. Recorded so a stale or absent
   * Agmarknet feed is visible in the result rather than silently looking like a
   * market-backed figure.
   */
  priceSource: 'mandi' | 'knowledge_base' | 'user';
  /** Set only when `priceSource` is `mandi`. */
  priceReference?: {
    commodity: string;
    mandiName: string;
    district: string;
    state: string;
    priceDate: Date;
  };
  estimatedTotalCost: number;
  estimatedTotalRevenue: number;
  estimatedNetProfit: number;
  profitPerAcre: number;
  yieldPerAcre: number;
  roiPercent: number;
  breakEvenPricePerUnit: number;
  recommendedBuyerIds: Types.ObjectId[];
  inputs: {
    yieldUserSupplied: boolean;
    priceUserSupplied: boolean;
    costUserSupplied: boolean;
  };
  generatedAt: Date;
  expiresAt: Date;
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const cropPredictionSchema = new Schema<ICropPrediction>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    farmProfileId: {
      type: Schema.Types.ObjectId,
      ref: 'FarmProfile',
    },
    cropName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    cropVariety: {
      type: String,
      trim: true,
    },
    location: {
      state: { type: String, required: true },
      district: { type: String, required: true },
    },
    farmSizeAcres: {
      type: Number,
      required: true,
      min: 0.01,
    },
    qualityGrade: {
      type: String,
      default: 'Standard',
      enum: ['Premium', 'Standard', 'Economy'],
    },
    estimatedYieldQty: {
      type: Number,
      required: true,
      min: 0,
    },
    yieldUnit: {
      type: String,
      default: 'kg',
    },
    expectedPricePerUnit: {
      type: Number,
      required: true,
      min: 0,
    },
    priceCurrency: {
      type: String,
      default: 'INR',
    },
    priceSource: {
      type: String,
      enum: ['mandi', 'knowledge_base', 'user'],
      default: 'knowledge_base',
      index: true,
    },
    priceReference: {
      type: new Schema(
        {
          commodity: { type: String, required: true },
          mandiName: { type: String, required: true },
          district: { type: String, required: true },
          state: { type: String, required: true },
          priceDate: { type: Date, required: true },
        },
        { _id: false }
      ),
      required: false,
    },
    estimatedTotalCost: {
      type: Number,
      required: true,
      min: 0,
    },
    estimatedTotalRevenue: {
      type: Number,
      required: true,
      min: 0,
    },
    estimatedNetProfit: {
      type: Number,
      required: true,
    },
    profitPerAcre: {
      type: Number,
      required: true,
    },
    yieldPerAcre: {
      type: Number,
      required: true,
      min: 0,
    },
    roiPercent: {
      type: Number,
      required: true,
    },
    breakEvenPricePerUnit: {
      type: Number,
      required: true,
      min: 0,
    },
    recommendedBuyerIds: [
      {
        type: Schema.Types.ObjectId,
        ref: 'BuyerRequirement',
      },
    ],
    inputs: {
      yieldUserSupplied: { type: Boolean, default: false },
      priceUserSupplied: { type: Boolean, default: false },
      costUserSupplied: { type: Boolean, default: false },
    },
    generatedAt: {
      type: Date,
      default: () => new Date(),
    },
    expiresAt: {
      type: Date,
      default: () => {
        const d = new Date();
        d.setDate(d.getDate() + 90);
        return d;
      },
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: Date,
  },
  {
    timestamps: true,
  }
);

cropPredictionSchema.index({ userId: 1, generatedAt: -1 });
cropPredictionSchema.index({ cropName: 1, 'location.state': 1 });
cropPredictionSchema.index({ userId: 1, isDeleted: 1 });

export const CropPrediction = model<ICropPrediction>(
  'CropPrediction',
  cropPredictionSchema
);

export type CropPredictionDoc = HydratedDocument<ICropPrediction>;
