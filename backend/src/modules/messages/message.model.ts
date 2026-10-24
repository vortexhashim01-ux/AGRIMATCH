import { Schema, model, Types } from 'mongoose';

export type MessageContentType = 'text' | 'voice';

export interface IMessage {
  _id?: Types.ObjectId;
  threadId: Types.ObjectId;
  senderId: Types.ObjectId;
  content: string;
  contentType: MessageContentType;
  audioUrl?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const messageSchema = new Schema<IMessage>(
  {
    threadId: {
      type: Schema.Types.ObjectId,
      ref: 'Thread',
      required: true,
      index: true,
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    content: { type: String, required: true, trim: true, maxlength: 1000 },
    contentType: {
      type: String,
      enum: ['text', 'voice'],
      default: 'text',
    },
    audioUrl: { type: String, trim: true },
  },
  { timestamps: true }
);

// Conversation pagination, newest first.
messageSchema.index({ threadId: 1, createdAt: -1 });

export const Message = model<IMessage>('Message', messageSchema);
