import { Schema, model, Types } from 'mongoose';

export interface ICropListing {
  _id?: Types.ObjectId;
  farmerId: Types.ObjectId;
  cropName: string;
  quantityKg: number;
  expectedPricePerKg: number;
  qualityGrade?: 'A' | 'B' | 'C';
  harvestDate?: Date;
  location?: {
    address?: string;
    state?: string;
    district?: string;
    pincode?: string;
    lat?: number;
    lng?: number;
  };
  status: 'active' | 'matched' | 'sold' | 'expired';
  isDeleted: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const cropListingSchema = new Schema<ICropListing>(
  {
    farmerId: {
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
    expectedPricePerKg: {
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
    harvestDate: {
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
      enum: ['active', 'matched', 'sold', 'expired'],
      default: 'active',
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

cropListingSchema.index({ 'location.state': 1, 'location.district': 1 });
cropListingSchema.index({ farmerId: 1, status: 1, createdAt: -1 });

export const CropListing = model<ICropListing>('CropListing', cropListingSchema);
