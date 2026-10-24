import { HydratedDocument, Types } from 'mongoose';
import { Thread, IThread } from './thread.model';
import { Message, IMessage } from './message.model';
import { MessageListQuery, SendMessageInput } from './message.schema';
import { Match } from '../matching/matching.model';
import { dispatchNotification } from '../notifications/notification.service';
import { emitToUser } from '../../sockets';

interface AppError extends Error {
  statusCode?: number;
  code?: string;
  isOperational?: boolean;
}

function createError(message: string, statusCode: number, code: string): AppError {
  const err = new Error(message) as AppError;
  err.statusCode = statusCode;
  err.code = code;
  err.isOperational = true;
  return err;
}

function toObjectId(id: Types.ObjectId | string): Types.ObjectId {
  return typeof id === 'string' ? new Types.ObjectId(id) : id;
}

export async function listThreads(userId: Types.ObjectId | string): Promise<IThread[]> {
  return Thread.find({ participantIds: toObjectId(userId) })
    .sort({ lastMessageAt: -1, createdAt: -1 })
    .limit(50);
}

/**
 * Opening a thread is idempotent: the conversation is created the first time
 * either side asks for it and the same thread is returned afterwards.
 */
export async function openThread(
  userId: Types.ObjectId | string,
  matchId: Types.ObjectId | string
): Promise<IThread> {
  const uid = toObjectId(userId);

  const match = await Match.findOne({
    _id: toObjectId(matchId),
    $or: [{ farmerId: uid }, { buyerId: uid }],
  });

  if (!match) {
    throw createError('Match not found', 404, 'MATCH_NOT_FOUND');
  }

  const thread = await Thread.findOneAndUpdate(
    { matchId: match._id },
    {
      $setOnInsert: {
        matchId: match._id,
        participantIds: [match.farmerId, match.buyerId],
        lastMessageAt: null,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return thread;
}

/** Returns `null` when the thread does not exist or the caller is not in it. */
export async function findThreadForUser(
  userId: Types.ObjectId | string,
  threadId: Types.ObjectId | string
): Promise<HydratedDocument<IThread> | null> {
  return Thread.findOne({
    _id: toObjectId(threadId),
    participantIds: toObjectId(userId),
  });
}

export async function listMessages(
  threadId: Types.ObjectId | string,
  query: MessageListQuery
): Promise<IMessage[]> {
  const limit = Math.max(1, Math.min(100, query.limit ?? 50));

  const filter: Record<string, unknown> = { threadId: toObjectId(threadId) };
  if (query.before) {
    filter.createdAt = { $lt: query.before };
  }

  // Newest-first for the "load earlier" cursor, then flipped to chronological
  // so the client can render top-to-bottom without re-sorting.
  const newestFirst = await Message.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit);

  return newestFirst.reverse();
}

export async function sendMessage(
  userId: Types.ObjectId | string,
  thread: HydratedDocument<IThread>,
  input: SendMessageInput
): Promise<IMessage> {
  if (input.contentType === 'voice' && !input.audioUrl) {
    throw createError(
      'audioUrl is required for voice messages',
      400,
      'VALIDATION_ERROR'
    );
  }

  const senderId = toObjectId(userId);

  const message = await Message.create({
    threadId: thread._id,
    senderId,
    content: input.content,
    contentType: input.contentType,
    audioUrl: input.audioUrl,
  });

  thread.lastMessageAt = message.createdAt ?? new Date();
  await thread.save();

  const payload = {
    threadId: thread._id?.toString(),
    matchId: thread.matchId.toString(),
    messageId: message._id?.toString(),
    senderId: senderId.toString(),
    content: message.content,
    contentType: message.contentType,
  };

  // Echo back to every device the sender has open so the other tabs stay in sync.
  emitToUser(senderId.toString(), 'message:new', payload);

  const recipientId = thread.participantIds
    .map((participant) => participant.toString())
    .find((participant) => participant !== senderId.toString());

  if (recipientId) {
    await dispatchNotification([recipientId], 'message:new', payload, {
      title: 'New message',
      body: message.content.slice(0, 200),
    });
  }

  return message;
}
