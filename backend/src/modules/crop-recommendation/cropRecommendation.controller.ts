import { Request, Response, NextFunction } from 'express';
import * as cropRecommendationService from './cropRecommendation.service';
import {
  CropRecommendationQuery,
  GenerateCropRecommendationInput,
} from './cropRecommendation.schema';
import { UserRole } from '../users/user.model';
import { assertOwnership } from '../../utils/assertOwnership';

interface AuthenticatedRequest extends Request {
  userId?: string;
  userRole?: UserRole;
}

function requireUser(req: AuthenticatedRequest, res: Response): boolean {
  if (!req.userId) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    });
    return false;
  }
  return true;
}

export async function generateCropRecommendation(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!requireUser(req, res)) return;

    const recommendation =
      await cropRecommendationService.generateCropRecommendation(
        req.userId!,
        req.body as GenerateCropRecommendationInput
      );

    res.status(201).json({
      success: true,
      data: recommendation,
      message: `Generated crop recommendations (${recommendation.recommendations.length} crops, confidence ${recommendation.aiConfidence}%)`,
    });
  } catch (error) {
    next(error);
  }
}

export async function listMyCropRecommendations(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!requireUser(req, res)) return;

    const recommendations =
      await cropRecommendationService.listCropRecommendationsForFarmer(
        req.userId!,
        req.query as unknown as CropRecommendationQuery
      );

    res.status(200).json({
      success: true,
      data: {
        count: recommendations.length,
        recommendations,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getCropRecommendationById(
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

    const recommendation =
      await cropRecommendationService.getCropRecommendationById(
        req.params.id,
        req.userRole === 'farmer' ? req.userId : undefined
      );

    if (!recommendation) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Crop recommendation not found',
        },
      });
    }

    // A recommendation is private to the farmer who generated it. The service
    // only scopes the lookup for farmers, so the ownership assertion must run
    // for every role (admins are exempted inside `assertOwnership`).
    assertOwnership(req.userId, req.userRole, recommendation.farmerId);

    res.status(200).json({
      success: true,
      data: recommendation,
    });
  } catch (error) {
    next(error);
  }
}
