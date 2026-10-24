import { Request, Response, NextFunction } from 'express';
import * as cropPredictionService from './cropPrediction.service';
import { PredictionQuery } from './cropPrediction.schema';
import { assertOwnership } from '../../utils/assertOwnership';
import { UserRole } from '../users/user.model';

interface AuthenticatedRequest extends Request {
  userId?: string;
  userRole?: UserRole;
}

function requireUser(
  req: AuthenticatedRequest,
  res: Response
): boolean {
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

async function loadOwnedPrediction(
  req: AuthenticatedRequest,
  res: Response
) {
  if (!req.userId || !req.userRole) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    });
    return null;
  }
  const prediction = await cropPredictionService.getPredictionById(
    req.params.id,
    req.userId
  );
  if (!prediction) {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Prediction not found',
      },
    });
    return null;
  }
  assertOwnership(req.userId, req.userRole, prediction.userId as never);
  return prediction;
}

export async function generatePrediction(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!requireUser(req, res)) return;

    const saved = await cropPredictionService.generatePrediction(
      req.userId!,
      req.body
    );

    res.status(201).json({
      success: true,
      data: saved,
      message: 'Profit prediction generated and saved',
    });
  } catch (error) {
    next(error);
  }
}

export async function listMyPredictions(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!requireUser(req, res)) return;

    const items = await cropPredictionService.listMyPredictions(
      req.userId!,
      req.query as unknown as PredictionQuery
    );

    res.status(200).json({
      success: true,
      data: {
        count: items.length,
        items,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getPredictionById(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!requireUser(req, res)) return;
    const doc = await cropPredictionService.getPredictionById(
      req.params.id,
      req.userId!
    );
    if (!doc) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Prediction not found',
        },
      });
    }
    if (req.userRole) {
      assertOwnership(req.userId!, req.userRole, doc.userId as never);
    }
    res.status(200).json({
      success: true,
      data: doc,
    });
  } catch (error) {
    next(error);
  }
}

export async function softDeletePrediction(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const doc = await loadOwnedPrediction(req, res);
    if (!doc) return;

    const updated = await cropPredictionService.softDeletePrediction(
      req.params.id,
      req.userId!
    );

    res.status(200).json({
      success: true,
      data: updated,
      message: 'Prediction deleted',
    });
  } catch (error) {
    next(error);
  }
}
