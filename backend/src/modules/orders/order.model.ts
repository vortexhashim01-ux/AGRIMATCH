import { Schema, model, Types } from 'mongoose';

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

export interface IOrder {
  _id?: Types.ObjectId;
  matchId: Types.ObjectId;
  farmerId: Types.ObjectId;
  buyerId: Types.ObjectId;
  cropName: string;
  quantityKg: number;
  agreedPricePerKg: number;
  deliveryDate: Date;
  status: OrderStatus;
  cancelledById?: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

const orderSchema = new Schema<IOrder>(
  {
    matchId: {
      type: Schema.Types.ObjectId,
      ref: 'Match',
      required: true,
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
    quantityKg: { type: Number, required: true, min: 0 },
    agreedPricePerKg: { type: Number, required: true, min: 0 },
    deliveryDate: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'],
      default: 'pending',
      index: true,
    },
    cancelledById: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// One deal per match — a match cannot be converted into two orders.
orderSchema.index({ matchId: 1 }, { unique: true });
orderSchema.index({ farmerId: 1, status: 1, createdAt: -1 });
orderSchema.index({ buyerId: 1, status: 1, createdAt: -1 });

export const Order = model<IOrder>('Order', orderSchema);
