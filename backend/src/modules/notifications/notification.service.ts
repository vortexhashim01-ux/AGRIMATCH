import { Types } from 'mongoose';
import { Notification, INotification, NotificationType } from './notification.model';
import { emitToUser } from '../../sockets';

export type { NotificationType };

export interface NotificationEventPayload {
  matchId?: string;
  orderId?: string;
  threadId?: string;
  cropName?: string;
  status?: string;
  overallScore?: number;
  [key: string]: unknown;
}

export type MatchEventPayload = NotificationEventPayload;

export interface ListNotificationsQuery {
  unreadOnly?: boolean;
  limit?: number;
  page?: number;
}

const NOTIFICATION_TITLES: Record<NotificationType, string> = {
  'match:new': 'New match found',
  'match:pending': 'Match awaiting confirmation',
  'match:accepted': 'Match accepted',
  'match:rejected': 'Match rejected',
  'match:expired': 'Match expired',
  'order:created': 'New order created',
  'order:status': 'Order status updated',
  'message:new': 'New message',
  'weather:alert': 'Weather alert',
};

/**
 * Pushes an event to the given users in real time *and* stores it, so a user
 * who was offline can still see what happened. Both sides are best-effort: a
 * socket or database hiccup must never fail the HTTP request that triggered it.
 */
export async function dispatchNotification(
  userIds: Array<Types.ObjectId | string>,
  type: NotificationType,
  payload: NotificationEventPayload,
  options?: { title?: string; body?: string }
): Promise<void> {
  const recipients = userIds.filter(Boolean).map((id) => String(id));
  if (recipients.length === 0) return;

  for (const userId of recipients) {
    emitToUser(userId, type, payload);
  }

  const bodyParts = [
    payload.cropName,
    payload.overallScore != null ? `score ${payload.overallScore}` : undefined,
  ].filter(Boolean);

  try {
    await Notification.insertMany(
      recipients.map((userId) => ({
        userId: new Types.ObjectId(userId),
        type,
        title: options?.title ?? NOTIFICATION_TITLES[type],
        body: options?.body ?? (bodyParts.join(' · ') || 'Notification'),
        data: { ...payload },
        readAt: null,
      }))
    );
  } catch (error) {
    console.error('[notifications] failed to persist event:', error);
  }
}

export async function dispatchMatchEvent(
  userIds: Array<Types.ObjectId | string>,
  type: NotificationType,
  payload: MatchEventPayload
): Promise<void> {
  return dispatchNotification(userIds, type, payload);
}

export async function listNotifications(userId: string, query: ListNotificationsQuery) {
  const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
  const page = Math.max(query.page ?? 1, 1);

  const filter: Record<string, unknown> = { userId: new Types.ObjectId(userId) };
  if (query.unreadOnly) filter.readAt = null;

  const [items, total, unread] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Notification.countDocuments(filter),
    Notification.countDocuments({ userId: new Types.ObjectId(userId), readAt: null }),
  ]);

  return { items, total, unread, page, limit };
}

export async function markNotificationRead(
  userId: string,
  notificationId: string
): Promise<INotification | null> {
  if (!Types.ObjectId.isValid(notificationId)) return null;
  return Notification.findOneAndUpdate(
    { _id: notificationId, userId: new Types.ObjectId(userId) },
    { $set: { readAt: new Date() } },
    { new: true }
  );
}

export async function markAllNotificationsRead(userId: string): Promise<number> {
  const result = await Notification.updateMany(
    { userId: new Types.ObjectId(userId), readAt: null },
    { $set: { readAt: new Date() } }
  );
  return result.modifiedCount;
}
