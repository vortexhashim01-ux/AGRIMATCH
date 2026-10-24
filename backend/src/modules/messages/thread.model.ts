import { Schema, model, Types } from 'mongoose';

export interface IThread {
  _id?: Types.ObjectId;
  matchId: Types.ObjectId;
  participantIds: Types.ObjectId[];
  lastMessageAt: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const threadSchema = new Schema<IThread>(
  {
    matchId: {
      type: Schema.Types.ObjectId,
      ref: 'Match',
      required: true,
    },
    participantIds: {
      type: [{ type: Schema.Types.ObjectId, ref: 'User' }],
      required: true,
    },
    lastMessageAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// A match has exactly one conversation.
threadSchema.index({ matchId: 1 }, { unique: true });
// Inbox lookup: a user's threads, most recently active first.
threadSchema.index({ participantIds: 1, lastMessageAt: -1 });

export const Thread = model<IThread>('Thread', threadSchema);
