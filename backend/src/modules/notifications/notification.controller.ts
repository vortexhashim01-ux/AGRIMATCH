import { Request, Response, NextFunction } from 'express';
import * as notificationService from './notification.service';
import { NotificationQuery } from './notification.schema';

interface AuthenticatedRequest extends Request {
  userId?: string;
}

export async function listNotifications(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
    }

    const result = await notificationService.listNotifications(
      req.userId,
      req.query as unknown as NotificationQuery
    );

    res.status(200).json({
      success: true,
      data: {
        count: result.items.length,
        total: result.total,
        unread: result.unread,
        page: result.page,
        limit: result.limit,
        notifications: result.items,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function markRead(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
    }

    const notification = await notificationService.markNotificationRead(req.userId, req.params.id);

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Notification not found' },
      });
    }

    res.status(200).json({ success: true, data: notification });
  } catch (error) {
    next(error);
  }
}

export async function markAllRead(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
    }

    const updated = await notificationService.markAllNotificationsRead(req.userId);
    res.status(200).json({ success: true, data: { updated } });
  } catch (error) {
    next(error);
  }
}
