import { Request, Response, NextFunction } from 'express';
import * as messageService from './message.service';
import {
  MessageListQuery,
  OpenThreadInput,
  SendMessageInput,
} from './message.schema';
import { UserRole } from '../users/user.model';

interface AuthenticatedRequest extends Request {
  userId?: string;
  userRole?: UserRole;
}

function requireUser(req: AuthenticatedRequest, res: Response): boolean {
  if (!req.userId) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
    return false;
  }
  return true;
}

function threadNotFound(res: Response) {
  // A thread the caller is not part of is reported as missing rather than
  // forbidden, so the endpoint never confirms that the thread exists.
  return res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Thread not found' },
  });
}

export async function listThreads(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!requireUser(req, res)) return;

    const threads = await messageService.listThreads(req.userId!);

    res.status(200).json({
      success: true,
      data: { count: threads.length, threads },
    });
  } catch (error) {
    next(error);
  }
}

export async function openThread(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!requireUser(req, res)) return;

    const thread = await messageService.openThread(
      req.userId!,
      (req.body as OpenThreadInput).matchId
    );

    res.status(200).json({ success: true, data: thread });
  } catch (error) {
    next(error);
  }
}

export async function listMessages(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!requireUser(req, res)) return;

    const thread = await messageService.findThreadForUser(
      req.userId!,
      req.params.threadId
    );
    if (!thread) return threadNotFound(res);

    const messages = await messageService.listMessages(
      thread._id!,
      req.query as unknown as MessageListQuery
    );

    res.status(200).json({
      success: true,
      data: { count: messages.length, thread, messages },
    });
  } catch (error) {
    next(error);
  }
}

export async function sendMessage(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!requireUser(req, res)) return;

    const thread = await messageService.findThreadForUser(
      req.userId!,
      req.params.threadId
    );
    if (!thread) return threadNotFound(res);

    const message = await messageService.sendMessage(
      req.userId!,
      thread,
      req.body as SendMessageInput
    );

    res.status(201).json({ success: true, data: message });
  } catch (error) {
    next(error);
  }
}
