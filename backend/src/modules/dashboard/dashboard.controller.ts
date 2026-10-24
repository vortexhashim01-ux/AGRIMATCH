import { Request, Response, NextFunction } from 'express';
import * as dashboardService from './dashboard.service';
import { UserRole } from '../users/user.model';

interface AuthenticatedRequest extends Request {
  userId?: string;
  userRole?: UserRole;
}

/**
 * The caller's own dashboard. The role is taken from the verified access token,
 * never from the request, so a farmer cannot ask for the admin view.
 */
export async function getSummary(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.userId || !req.userRole) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
    }

    const data = await dashboardService.getDashboardSummary(
      req.userId,
      req.userRole
    );

    res.status(200).json({
      success: true,
      data: { ...data, generatedAt: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
}
