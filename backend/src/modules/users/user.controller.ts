import { Request, Response, NextFunction } from 'express';
import * as userService from './user.service';
import {
  ListUsersQuery,
  UpdatePreferencesInput,
  UserStatusInput,
} from './user.schema';
import { UserRole } from './user.model';
import { clearAuthCookies } from '../../utils/jwt';

interface AuthenticatedRequest extends Request {
  userId?: string;
  userRole?: UserRole;
}

export async function listUsers(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const query = req.query as unknown as ListUsersQuery;

    // Hiding a disabled account is the default; only an admin may ask to see
    // them, so moderation state is not exposed to ordinary users.
    if (query.status !== 'active' && req.userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Only an admin can list inactive accounts',
        },
      });
    }

    const result = await userService.listUsers(query);

    res.status(200).json({
      success: true,
      data: {
        count: result.items.length,
        total: result.total,
        page: result.page,
        limit: result.limit,
        users: result.items,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function setUserStatus(
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

    // Guard against an admin locking themselves out of the only account that
    // can reach this route.
    if (req.params.id === req.userId) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'CANNOT_DISABLE_SELF',
          message: 'You cannot change the status of your own account',
        },
      });
    }

    const { isActive } = req.body as UserStatusInput;
    const user = await userService.setUserActive(req.params.id, isActive);

    res.status(200).json({
      success: true,
      data: { user },
      message: isActive ? 'Account enabled' : 'Account disabled',
    });
  } catch (error) {
    next(error);
  }
}

export async function updateMyPreferences(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
    }

    const preferences = await userService.updatePreferences(
      req.userId,
      req.body as UpdatePreferencesInput
    );

    res.status(200).json({
      success: true,
      data: { preferences },
      message: 'Preferences updated',
    });
  } catch (error) {
    next(error);
  }
}

/** Data portability (PRD §12): a machine-readable dump of everything held. */
export async function exportMyData(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
    }

    const data = await userService.exportUserData(req.userId);

    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

/**
 * Self-serve account deletion (PRD §12). Deleting your own account needs no
 * one else's confirmation, so this is a plain authenticated action.
 */
export async function deleteMyAccount(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
    }

    const result = await userService.deleteMyAccount(req.userId);

    // Both auth cookies now point at an account that no longer exists, so they
    // are cleared here rather than leaving the client to find out on refresh.
    clearAuthCookies(res);

    res.status(200).json({
      success: true,
      data: result,
      message: 'Account deleted',
    });
  } catch (error) {
    next(error);
  }
}
