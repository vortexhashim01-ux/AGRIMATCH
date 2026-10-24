import { Request, Response, NextFunction } from 'express';
import * as cropListingService from './cropListing.service';
import {
  CropListingInput,
  CropListingQuery,
  CropListingUpdateInput,
} from './cropListing.schema';
import { assertOwnership } from '../../utils/assertOwnership';
import { UserRole } from '../users/user.model';
import { ICropListing } from './cropListing.model';

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

async function loadOwnedListing(req: AuthenticatedRequest, res: Response) {
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

  const listing = await cropListingService.getCropListingById(req.params.id);
  if (!listing || listing.isDeleted) {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Crop listing not found',
      },
    });
    return null;
  }

  assertOwnership(req.userId, req.userRole, listing.farmerId);
  return listing;
}

export async function createCropListing(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!requireUser(req, res)) return;

    const listing = await cropListingService.createCropListing(
      req.userId!,
      req.body as CropListingInput
    );

    res.status(201).json({
      success: true,
      data: listing,
      message: 'Crop listing approved and published as active',
    });
  } catch (error) {
    next(error);
  }
}

export async function listMarketplace(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const listings = await cropListingService.searchCropListings(
      req.query as unknown as CropListingQuery
    );

    res.status(200).json({
      success: true,
      data: {
        count: listings.length,
        listings,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function listMyCropListings(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!requireUser(req, res)) return;

    const listings = await cropListingService.searchCropListings(
      req.query as unknown as CropListingQuery,
      { farmerId: req.userId }
    );

    res.status(200).json({
      success: true,
      data: {
        count: listings.length,
        listings,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getCropListingById(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const listing = await cropListingService.getCropListingById(req.params.id);

    if (!listing || listing.isDeleted) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Crop listing not found',
        },
      });
    }

    res.status(200).json({
      success: true,
      data: listing,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateCropListing(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const listing = await loadOwnedListing(req, res);
    if (!listing) return;

    const updated = await cropListingService.updateCropListing(
      req.params.id,
      req.userId!,
      req.body as CropListingUpdateInput
    );

    res.status(200).json({
      success: true,
      data: updated,
      message: 'Crop listing updated',
    });
  } catch (error) {
    next(error);
  }
}

export async function changeCropListingStatus(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const listing = await loadOwnedListing(req, res);
    if (!listing) return;

    const updated = await cropListingService.setCropListingStatus(
      req.params.id,
      req.userId!,
      req.body.status as ICropListing['status']
    );

    res.status(200).json({
      success: true,
      data: updated,
      message: `Crop listing status set to ${updated.status}`,
    });
  } catch (error) {
    next(error);
  }
}

export async function approveCropListing(
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

    const listing = await cropListingService.getCropListingById(req.params.id);
    if (!listing) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Crop listing not found',
        },
      });
    }

    assertOwnership(req.userId, req.userRole, listing.farmerId);

    const updated = await cropListingService.approveCropListing(
      req.params.id,
      req.userId
    );

    res.status(200).json({
      success: true,
      data: updated,
      message: 'Crop listing approved and set to active',
    });
  } catch (error) {
    next(error);
  }
}

export async function discardCropListing(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const listing = await loadOwnedListing(req, res);
    if (!listing) return;

    await cropListingService.discardCropListing(req.params.id, req.userId!);

    res.status(200).json({
      success: true,
      message: 'Crop listing discarded',
    });
  } catch (error) {
    next(error);
  }
}
