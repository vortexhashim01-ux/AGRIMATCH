import { Schema, model, Types } from 'mongoose';

export interface IMandiPrice {
  _id?: Types.ObjectId;
  commodity: string;
  mandiName: string;
  district: string;
  state: string;
  minPricePerQuintal: number;
  modalPricePerQuintal: number;
  maxPricePerQuintal: number;
  priceDate: Date;
  source: string;
  fetchedAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const mandiPriceSchema = new Schema<IMandiPrice>(
  {
    commodity: { type: String, required: true, trim: true, index: true },
    mandiName: { type: String, required: true, trim: true, index: true },
    district: { type: String, required: true, trim: true, index: true },
    state: { type: String, required: true, trim: true, index: true },
    minPricePerQuintal: { type: Number, required: true, min: 0 },
    modalPricePerQuintal: { type: Number, required: true, min: 0 },
    maxPricePerQuintal: { type: Number, required: true, min: 0 },
    priceDate: { type: Date, required: true },
    source: { type: String, default: 'agmarknet' },
    fetchedAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// Natural key for upserts from the Agmarknet feed.
mandiPriceSchema.index(
  { commodity: 1, mandiName: 1, district: 1, state: 1, priceDate: 1 },
  { unique: true }
);
// Serves the commodity + location + recency query path.
mandiPriceSchema.index({ commodity: 1, state: 1, district: 1, priceDate: -1 });

export const MandiPrice = model<IMandiPrice>('MandiPrice', mandiPriceSchema);
