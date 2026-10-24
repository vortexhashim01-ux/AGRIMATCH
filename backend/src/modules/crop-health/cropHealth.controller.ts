import { Request, Response, NextFunction } from 'express';
import * as cropHealthService from './cropHealth.service';
import { ScanListQuery } from './cropHealth.schema';
import { UserRole } from '../users/user.model';

interface AuthenticatedRequest extends Request {
  userId?: string;
  userRole?: UserRole;
}

function unauthorized(res: Response) {
  return res.status(401).json({
    success: false,
    error: {
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    },
  });
}

export async function diagnoseCropHealthScan(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.userId) return unauthorized(res);

    const file = req.file;
    if (!file) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'image file is required',
        },
      });
    }

    const { cropName } = req.body as { cropName?: string };

    const result = await cropHealthService.diagnose(
      req.userId,
      {
        buffer: file.buffer,
        mimeType: file.mimetype,
        originalName: file.originalname,
      },
      cropName
    );

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function listCropHealthScans(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.userId) return unauthorized(res);

    const scans = await cropHealthService.listScans(
      req.userId,
      req.query as unknown as ScanListQuery
    );

    res.status(200).json({
      success: true,
      data: {
        count: scans.length,
        scans,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getCropHealthScan(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.userId) return unauthorized(res);

    const scan = await cropHealthService.getScan(req.userId, req.params.id);

    if (!scan) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Scan not found',
        },
      });
    }

    res.status(200).json({ success: true, data: scan });
  } catch (error) {
    next(error);
  }
}

export async function resolveCropHealthScan(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.userId) return unauthorized(res);

    const scan = await cropHealthService.resolveScan(req.userId, req.params.id);

    res.status(200).json({
      success: true,
      data: scan,
      message: 'Scan marked resolved',
    });
  } catch (error) {
    next(error);
  }
}
