import { Schema, model, Types } from 'mongoose';

export type MatchStatus =
  | 'suggested'
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'expired';

export interface IMatchScoreBreakdown {
  cropNameFit: number;
  priceFit: number;
  quantityFit: number;
  qualityFit: number;
  locationFit: number;
  timelineFit: number;
  farmerReliabilityFit: number;
  overallScore: number;
}

export interface IMatch {
  _id?: Types.ObjectId;
  cropListingId: Types.ObjectId;
  buyerRequirementId: Types.ObjectId;
  farmerId: Types.ObjectId;
  buyerId: Types.ObjectId;
  cropName: string;
  status: MatchStatus;
  hardFilterPass: boolean;
  hardFilterFailures?: string[];
  scores: IMatchScoreBreakdown;
  farmerReliabilityScore: number;
  matchExpiresAt?: Date;
  farmerViewedAt?: Date;
  buyerViewedAt?: Date;
  rejectedById?: Types.ObjectId;
  rejectedReason?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const scoreBreakdownSchema = new Schema<IMatchScoreBreakdown>(
  {
    cropNameFit: { type: Number, required: true, min: 0, max: 100 },
    priceFit: { type: Number, required: true, min: 0, max: 100 },
    quantityFit: { type: Number, required: true, min: 0, max: 100 },
    qualityFit: { type: Number, required: true, min: 0, max: 100 },
    locationFit: { type: Number, required: true, min: 0, max: 100 },
    timelineFit: { type: Number, required: true, min: 0, max: 100 },
    farmerReliabilityFit: { type: Number, required: true, min: 0, max: 100 },
    overallScore: { type: Number, required: true, min: 0, max: 100, index: true },
  },
  { _id: false }
);

const matchSchema = new Schema<IMatch>(
  {
    cropListingId: {
      type: Schema.Types.ObjectId,
      ref: 'CropListing',
      required: true,
      index: true,
    },
    buyerRequirementId: {
      type: Schema.Types.ObjectId,
      ref: 'BuyerRequirement',
      required: true,
      index: true,
    },
    farmerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    buyerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    cropName: { type: String, required: true, trim: true, index: true },
    status: {
      type: String,
      enum: ['suggested', 'pending', 'accepted', 'rejected', 'expired'],
      default: 'suggested',
      index: true,
    },
    hardFilterPass: { type: Boolean, required: true },
    hardFilterFailures: { type: [String], default: [] },
    scores: { type: scoreBreakdownSchema, required: true },
    farmerReliabilityScore: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
      default: 100,
    },
    matchExpiresAt: { type: Date, index: true },
    farmerViewedAt: { type: Date },
    buyerViewedAt: { type: Date },
    rejectedById: { type: Schema.Types.ObjectId, ref: 'User' },
    rejectedReason: { type: String, max: 255 },
  },
  {
    timestamps: true,
  }
);

matchSchema.index(
  { cropListingId: 1, buyerRequirementId: 1 },
  { unique: true }
);
matchSchema.index({ farmerId: 1, status: 1, createdAt: -1 });
matchSchema.index({ buyerId: 1, status: 1, createdAt: -1 });

export const Match = model<IMatch>('Match', matchSchema);
