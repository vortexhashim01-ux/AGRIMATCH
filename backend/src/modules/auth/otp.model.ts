import { Schema, model } from 'mongoose';

export interface IOtp {
  identifier: string;
  codeHash: string;
  attempts: number;
  codeExpiresAt: Date;
  requestedAt: Date[];
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const otpSchema = new Schema<IOtp>(
  {
    identifier: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    codeHash: {
      type: String,
      required: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    codeExpiresAt: {
      type: Date,
      required: true,
    },
    requestedAt: {
      type: [Date],
      default: [],
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// TTL: the document survives the full rate-limit window, then MongoDB drops it.
// The code itself expires earlier via `codeExpiresAt`.
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Otp = model<IOtp>('Otp', otpSchema);
