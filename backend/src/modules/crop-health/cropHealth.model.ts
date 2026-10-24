import { Schema, model, Types } from 'mongoose';

export type ScanSeverity = 'low' | 'moderate' | 'severe' | 'unknown';

export interface IHealthScanAlternative {
  disease: string;
  confidence: number;
}

export interface ICropHealthScan {
  _id?: Types.ObjectId;
  farmerId: Types.ObjectId;
  cropName?: string;
  imageUrl: string;
  imageProviderId?: string;
  disease: string;
  confidence: number;
  severity: ScanSeverity;
  treatmentSteps: string[];
  preventionTips: string[];
  alternatives: IHealthScanAlternative[];
  resolvedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const alternativeSchema = new Schema<IHealthScanAlternative>(
  {
    disease: { type: String, required: true },
    confidence: { type: Number, required: true, min: 0, max: 1 },
  },
  { _id: false }
);

const cropHealthScanSchema = new Schema<ICropHealthScan>(
  {
    farmerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    cropName: { type: String, trim: true, index: true },
    imageUrl: { type: String, required: true },
    imageProviderId: { type: String },
    disease: { type: String, required: true, trim: true, index: true },
    confidence: { type: Number, required: true, min: 0, max: 1 },
    severity: {
      type: String,
      enum: ['low', 'moderate', 'severe', 'unknown'],
      default: 'unknown',
    },
    treatmentSteps: { type: [String], default: [] },
    preventionTips: { type: [String], default: [] },
    alternatives: { type: [alternativeSchema], default: [] },
    resolvedAt: { type: Date },
  },
  { timestamps: true }
);

cropHealthScanSchema.index({ farmerId: 1, createdAt: -1 });

export const CropHealthScan = model<ICropHealthScan>(
  'CropHealthScan',
  cropHealthScanSchema
);
