import { Schema, model, Types } from 'mongoose';

export interface IBuyerRequirement {
  _id?: Types.ObjectId;
  buyerId: Types.ObjectId;
  cropName: string;
  quantityKg: number;
  maxPricePerKg: number;
  qualityGrade?: 'A' | 'B' | 'C';
  requiredByDate?: Date;
  location?: {
    address?: string;
    state?: string;
    district?: string;
    pincode?: string;
    lat?: number;
    lng?: number;
  };
  status: 'open' | 'matched' | 'fulfilled' | 'expired';
  isDeleted: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const buyerRequirementSchema = new Schema<IBuyerRequirement>(
  {
    buyerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    cropName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    quantityKg: {
      type: Number,
      required: true,
      min: 0,
    },
    maxPricePerKg: {
      type: Number,
      required: true,
      min: 0,
      index: true,
    },
    qualityGrade: {
      type: String,
      enum: ['A', 'B', 'C'],
      index: true,
    },
    requiredByDate: {
      type: Date,
      index: true,
    },
    location: {
      address: String,
      state: String,
      district: String,
      pincode: String,
      lat: Number,
      lng: Number,
    },
    status: {
      type: String,
      enum: ['open', 'matched', 'fulfilled', 'expired'],
      default: 'open',
      index: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

buyerRequirementSchema.index({ 'location.state': 1, 'location.district': 1 });
buyerRequirementSchema.index({ buyerId: 1, status: 1, createdAt: -1 });

export const BuyerRequirement = model<IBuyerRequirement>(
  'BuyerRequirement',
  buyerRequirementSchema
);
