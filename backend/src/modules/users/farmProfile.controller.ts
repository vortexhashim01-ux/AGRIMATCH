import { Request, Response, NextFunction } from 'express';
import * as farmProfileService from './farmProfile.service';
import { FarmProfileInput } from './farmProfile.schema';
import { assertOwnership } from '../../utils/assertOwnership';
import { UserRole } from './user.model';

interface AuthenticatedRequest extends Request {
  userId?: string;
  userRole?: UserRole;
}

export async function createFarmProfile(req: AuthenticatedRequest, res: Response, next: NextFunction) {
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

    const farmProfile = await farmProfileService.createFarmProfile(
      req.userId,
      req.body as FarmProfileInput
    );

    res.status(201).json({
      success: true,
      data: farmProfile,
    });
  } catch (error) {
    next(error);
  }
}

export async function getMyFarmProfile(req: AuthenticatedRequest, res: Response, next: NextFunction) {
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

    const farmProfile = await farmProfileService.getFarmProfileByFarmerId(req.userId);

    res.status(200).json({
      success: true,
      data: farmProfile,
    });
  } catch (error) {
    next(error);
  }
}

export async function getFarmProfileById(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const farmProfile = await farmProfileService.getFarmProfileById(id);

    if (!farmProfile) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Farm profile not found',
        },
      });
    }

    res.status(200).json({
      success: true,
      data: farmProfile,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateFarmProfile(req: AuthenticatedRequest, res: Response, next: NextFunction) {
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

    const { id } = req.params;
    const farmProfile = await farmProfileService.getFarmProfileById(id);

    if (!farmProfile) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Farm profile not found',
        },
      });
    }

    assertOwnership(req.userId, req.userRole, farmProfile.farmerId);

    const updated = await farmProfileService.updateFarmProfile(
      id,
      req.userId,
      req.body as Partial<FarmProfileInput>
    );

    res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteFarmProfile(req: AuthenticatedRequest, res: Response, next: NextFunction) {
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

    const { id } = req.params;
    const farmProfile = await farmProfileService.getFarmProfileById(id);

    if (!farmProfile) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Farm profile not found',
        },
      });
    }

    assertOwnership(req.userId, req.userRole, farmProfile.farmerId);

    await farmProfileService.deleteFarmProfile(id, req.userId);

    res.status(200).json({
      success: true,
      message: 'Farm profile deleted successfully',
    });
  } catch (error) {
    next(error);
  }
}
