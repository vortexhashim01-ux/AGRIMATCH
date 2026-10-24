import { Request, Response, NextFunction } from 'express';
import * as buyerRequirementService from './buyerRequirement.service';
import {
  BuyerRequirementInput,
  BuyerRequirementQuery,
  BuyerRequirementUpdateInput,
} from './buyerRequirement.schema';
import { assertOwnership } from '../../utils/assertOwnership';
import { UserRole } from '../users/user.model';
import { IBuyerRequirement } from './buyerRequirement.model';

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

async function loadOwnedRequirement(req: AuthenticatedRequest, res: Response) {
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

  const requirement = await buyerRequirementService.getBuyerRequirementById(
    req.params.id
  );
  if (!requirement || requirement.isDeleted) {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Buyer requirement not found',
      },
    });
    return null;
  }

  assertOwnership(req.userId, req.userRole, requirement.buyerId);
  return requirement;
}

export async function createBuyerRequirement(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!requireUser(req, res)) return;

    const requirement = await buyerRequirementService.createBuyerRequirement(
      req.userId!,
      req.body as BuyerRequirementInput
    );

    res.status(201).json({
      success: true,
      data: requirement,
      message: 'Buyer requirement approved and published as open',
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
    const requirements =
      await buyerRequirementService.searchBuyerRequirements(
        req.query as unknown as BuyerRequirementQuery
      );

    res.status(200).json({
      success: true,
      data: {
        count: requirements.length,
        requirements,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function listMyBuyerRequirements(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!requireUser(req, res)) return;

    const requirements =
      await buyerRequirementService.searchBuyerRequirements(
        req.query as unknown as BuyerRequirementQuery,
        { buyerId: req.userId }
      );

    res.status(200).json({
      success: true,
      data: {
        count: requirements.length,
        requirements,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getBuyerRequirementById(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const requirement = await buyerRequirementService.getBuyerRequirementById(
      req.params.id
    );

    if (!requirement || requirement.isDeleted) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Buyer requirement not found',
        },
      });
    }

    res.status(200).json({
      success: true,
      data: requirement,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateBuyerRequirement(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const requirement = await loadOwnedRequirement(req, res);
    if (!requirement) return;

    const updated = await buyerRequirementService.updateBuyerRequirement(
      req.params.id,
      req.userId!,
      req.body as BuyerRequirementUpdateInput
    );

    res.status(200).json({
      success: true,
      data: updated,
      message: 'Buyer requirement updated',
    });
  } catch (error) {
    next(error);
  }
}

export async function changeBuyerRequirementStatus(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const requirement = await loadOwnedRequirement(req, res);
    if (!requirement) return;

    const updated = await buyerRequirementService.setBuyerRequirementStatus(
      req.params.id,
      req.userId!,
      req.body.status as IBuyerRequirement['status']
    );

    res.status(200).json({
      success: true,
      data: updated,
      message: `Buyer requirement status set to ${updated.status}`,
    });
  } catch (error) {
    next(error);
  }
}

export async function approveBuyerRequirement(
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

    const requirement = await buyerRequirementService.getBuyerRequirementById(
      req.params.id
    );
    if (!requirement) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Buyer requirement not found',
        },
      });
    }

    assertOwnership(req.userId, req.userRole, requirement.buyerId);

    const updated = await buyerRequirementService.approveBuyerRequirement(
      req.params.id,
      req.userId
    );

    res.status(200).json({
      success: true,
      data: updated,
      message: 'Buyer requirement approved and set to open',
    });
  } catch (error) {
    next(error);
  }
}

export async function discardBuyerRequirement(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const requirement = await loadOwnedRequirement(req, res);
    if (!requirement) return;

    await buyerRequirementService.discardBuyerRequirement(
      req.params.id,
      req.userId!
    );

    res.status(200).json({
      success: true,
      message: 'Buyer requirement discarded',
    });
  } catch (error) {
    next(error);
  }
}
