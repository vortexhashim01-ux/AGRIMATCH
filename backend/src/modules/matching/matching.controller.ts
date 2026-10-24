import { Request, Response, NextFunction } from 'express';
import * as matchingService from './matching.service';
import { MatchingQuery } from './matching.schema';
import { assertOwnership } from '../../utils/assertOwnership';
import { UserRole } from '../users/user.model';

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

async function loadOwnedMatch(req: AuthenticatedRequest, res: Response) {
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

  const role = req.userRole === 'farmer' ? 'farmer' : 'buyer';
  const match = await matchingService.getMatchById(
    req.params.id,
    req.userId,
    role
  );
  if (!match) {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Match not found',
      },
    });
    return null;
  }

  const ownerId =
    req.userRole === 'farmer' ? match.farmerId : match.buyerId;
  assertOwnership(req.userId, req.userRole, ownerId);
  return match;
}

export async function runMatchingForListing(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!requireUser(req, res)) return;

    const result = await matchingService.runMatchingForListing(
      req.params.listingId,
      req.userId!,
      req.body
    );

    res.status(200).json({
      success: true,
      data: {
        evaluated: result.evaluated,
        newMatches: result.newMatches,
        count: result.matches.length,
        matches: result.matches,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function runMatchingForRequirement(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!requireUser(req, res)) return;

    const result = await matchingService.runMatchingForRequirement(
      req.params.requirementId,
      req.userId!,
      req.body
    );

    res.status(200).json({
      success: true,
      data: {
        evaluated: result.evaluated,
        newMatches: result.newMatches,
        count: result.matches.length,
        matches: result.matches,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function listMyMatches(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!requireUser(req, res)) return;

    const role = req.userRole === 'farmer' ? 'farmer' : 'buyer';
    const matches = await matchingService.listMatchesForUser(
      req.userId!,
      role,
      req.query as unknown as MatchingQuery
    );

    res.status(200).json({
      success: true,
      data: {
        count: matches.length,
        matches,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getMatchById(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!requireUser(req, res)) return;

    const role = req.userRole === 'farmer' ? 'farmer' : 'buyer';
    const match = await matchingService.getMatchById(
      req.params.id,
      req.userId!,
      role
    );

    if (!match) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Match not found',
        },
      });
    }

    res.status(200).json({
      success: true,
      data: match,
    });
  } catch (error) {
    next(error);
  }
}

export async function acceptMatch(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const match = await loadOwnedMatch(req, res);
    if (!match) return;

    const role = req.userRole === 'farmer' ? 'farmer' : 'buyer';
    const updated = await matchingService.acceptMatch(
      req.params.id,
      req.userId!,
      role
    );

    res.status(200).json({
      success: true,
      data: updated,
      message: `Match accepted; status: ${updated.status}`,
    });
  } catch (error) {
    next(error);
  }
}

export async function rejectMatch(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const match = await loadOwnedMatch(req, res);
    if (!match) return;

    const updated = await matchingService.rejectMatch(
      req.params.id,
      req.userId!,
      req.body?.reason
    );

    res.status(200).json({
      success: true,
      data: updated,
      message: 'Match rejected',
    });
  } catch (error) {
    next(error);
  }
}
