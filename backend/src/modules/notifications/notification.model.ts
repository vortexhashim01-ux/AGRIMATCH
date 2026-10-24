import { Schema, model, Types } from 'mongoose';

export type NotificationType =
  | 'match:new'
  | 'match:pending'
  | 'match:accepted'
  | 'match:rejected'
  | 'match:expired'
  | 'order:created'
  | 'order:status'
  | 'message:new'
  | 'weather:alert';

export interface INotification {
  _id?: Types.ObjectId;
  userId: Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  readAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      enum: [
        'match:new',
        'match:pending',
        'match:accepted',
        'match:rejected',
        'match:expired',
        'order:created',
        'order:status',
        'message:new',
        'weather:alert',
      ],
      required: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    body: { type: String, required: true, trim: true, maxlength: 255 },
    data: { type: Schema.Types.Mixed, default: {} },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Feed lookup: newest first, per user.
notificationSchema.index({ userId: 1, createdAt: -1 });
// Unread badge count.
notificationSchema.index({ userId: 1, readAt: 1 });
// Housekeeping: notifications are retained for 90 days, then MongoDB drops them.
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

export const Notification = model<INotification>('Notification', notificationSchema);
