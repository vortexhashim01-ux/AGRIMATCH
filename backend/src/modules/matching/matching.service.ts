import { Types } from 'mongoose';
import { IMatchScoreBreakdown, Match, IMatch, MatchStatus } from './matching.model';
import { CropListing, ICropListing } from '../crop-listing/cropListing.model';
import {
  BuyerRequirement,
  IBuyerRequirement,
} from '../buyer-requirements/buyerRequirement.model';
import { MatchingQuery } from './matching.schema';
import {
  dispatchMatchEvent,
  NotificationType,
} from '../notifications/notification.service';

interface AppError extends Error {
  statusCode?: number;
  code?: string;
  isOperational?: boolean;
}

function createError(message: string, statusCode: number, code: string): AppError {
  const err = new Error(message) as AppError;
  err.statusCode = statusCode;
  err.code = code;
  err.isOperational = true;
  return err;
}

function toObjectId(id: Types.ObjectId | string): Types.ObjectId {
  return typeof id === 'string' ? new Types.ObjectId(id) : id;
}

function norm(s?: string | null): string {
  return (s ?? '').toString().trim().toLowerCase();
}

function normEquals(a?: string | null, b?: string | null): boolean {
  const x = norm(a);
  const y = norm(b);
  return !!x && !!y && x === y;
}

function normIncludes(needle: string | null | undefined, haystack: string | null | undefined): boolean {
  const n = norm(needle);
  const h = norm(haystack);
  return !!n && !!h && h.includes(n);
}

function clamp(v: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, v));
}

export interface HardFilterResult {
  pass: boolean;
  failures: string[];
}

export function hardFilterPass(
  listing: ICropListing,
  req: IBuyerRequirement
): HardFilterResult {
  const failures: string[] = [];

  if (!normEquals(listing.cropName, req.cropName)) {
    failures.push('crop name mismatch');
  }

  if (listing.status !== 'active') {
    failures.push(`crop listing status=${listing.status} (must be active)`);
  }
  if (req.status !== 'open') {
    failures.push(`buyer requirement status=${req.status} (must be open)`);
  }

  if (
    !normEquals(listing.location?.district, req.location?.district) &&
    !normEquals(listing.location?.state, req.location?.state)
  ) {
    failures.push('no district or state overlap');
  }

  if (listing.harvestDate && req.requiredByDate) {
    if (listing.harvestDate > req.requiredByDate) {
      failures.push('harvest date is after the buyer required-by date');
    }
  }

  if (listing.isDeleted) {
    failures.push('crop listing is discarded');
  }
  if (req.isDeleted) {
    failures.push('buyer requirement is discarded');
  }

  return { pass: failures.length === 0, failures };
}

export interface ScoreWeights {
  cropNameFit: number;
  priceFit: number;
  quantityFit: number;
  qualityFit: number;
  locationFit: number;
  timelineFit: number;
  farmerReliabilityFit: number;
}

const DEFAULT_WEIGHTS: ScoreWeights = {
  cropNameFit: 10,
  priceFit: 22,
  quantityFit: 18,
  qualityFit: 10,
  locationFit: 20,
  timelineFit: 12,
  farmerReliabilityFit: 8,
};

export function computeScoreBreakdown(
  listing: ICropListing,
  req: IBuyerRequirement,
  farmerReliability = 100,
  weights = DEFAULT_WEIGHTS
): IMatchScoreBreakdown {
  const cropNameFit = normEquals(listing.cropName, req.cropName) ? 100 : 30;

  const expected = Number(listing.expectedPricePerKg ?? 0);
  const maxBuyer = Number(req.maxPricePerKg ?? 0);
  let priceFit: number;
  if (maxBuyer <= 0 || expected <= 0) {
    priceFit = 50;
  } else if (expected <= maxBuyer) {
    priceFit = 95;
  } else {
    const gap = (expected - maxBuyer) / maxBuyer;
    priceFit = clamp(65 - gap * 150);
  }

  const lQty = Number(listing.quantityKg ?? 0);
  const rQty = Number(req.quantityKg ?? 0);
  let quantityFit: number;
  if (lQty <= 0 || rQty <= 0) {
    quantityFit = 50;
  } else {
    const ratio = Math.min(lQty, rQty) / Math.max(lQty, rQty);
    quantityFit = clamp(30 + ratio * 70);
  }

  const lq = norm(listing.qualityGrade as unknown as string);
  const rq = norm(req.qualityGrade as unknown as string);
  let qualityFit = 50;
  if (lq && rq) {
    if (lq === rq) qualityFit = 100;
    else {
      const order = ['a', 'b', 'c'];
      const li = order.indexOf(lq);
      const ri = order.indexOf(rq);
      if (li >= 0 && ri >= 0 && li <= ri) qualityFit = 80;
      else qualityFit = 45;
    }
  } else if (lq || rq) {
    qualityFit = 70;
  }

  let locationFit = 0;
  if (normEquals(listing.location?.district, req.location?.district)) locationFit = 100;
  else if (normEquals(listing.location?.state, req.location?.state)) locationFit = 75;
  else if (
    normIncludes(listing.location?.state, req.location?.state) ||
    normIncludes(req.location?.state, listing.location?.state)
  )
    locationFit = 55;
  else locationFit = 25;

  let timelineFit = 50;
  if (listing.harvestDate && req.requiredByDate) {
    const l = listing.harvestDate.getTime();
    const r = req.requiredByDate.getTime();
    const days = (r - l) / (1000 * 60 * 60 * 24);
    if (days < 0) timelineFit = clamp(30 + days * 1.2);
    else if (days <= 60) timelineFit = 95;
    else if (days <= 180) timelineFit = 80;
    else timelineFit = 60;
  } else if (listing.harvestDate || req.requiredByDate) {
    timelineFit = 70;
  }

  const farmerReliabilityFit = clamp(farmerReliability);

  const raw =
    cropNameFit * weights.cropNameFit +
    priceFit * weights.priceFit +
    quantityFit * weights.quantityFit +
    qualityFit * weights.qualityFit +
    locationFit * weights.locationFit +
    timelineFit * weights.timelineFit +
    farmerReliabilityFit * weights.farmerReliabilityFit;
  const totalWeight =
    weights.cropNameFit +
    weights.priceFit +
    weights.quantityFit +
    weights.qualityFit +
    weights.locationFit +
    weights.timelineFit +
    weights.farmerReliabilityFit;
  const overallScore = Math.round(raw / totalWeight);

  return {
    cropNameFit: Math.round(cropNameFit),
    priceFit: Math.round(priceFit),
    quantityFit: Math.round(quantityFit),
    qualityFit: Math.round(qualityFit),
    locationFit: Math.round(locationFit),
    timelineFit: Math.round(timelineFit),
    farmerReliabilityFit: Math.round(farmerReliabilityFit),
    overallScore: clamp(overallScore),
  };
}

// Reliability comes from a farmer's decisive match outcomes. The PRD sources this
// from completed orders, but that module is V1.1 and does not exist yet, so the
// accepted/rejected history on `Match` is the best available signal.
const RELIABILITY_BASELINE = 0.7;
const RELIABILITY_PRIOR = 3;
const NEUTRAL_RELIABILITY = Math.round(RELIABILITY_BASELINE * 100);

/**
 * Laplace-smoothed acceptance rate. The prior keeps the score near the baseline
 * for farmers with little history and lets it converge on the observed rate as
 * decisive outcomes accumulate, so a single accept cannot pin a farmer at 100.
 */
function reliabilityFromOutcomes(accepted: number, rejected: number): number {
  const smoothed =
    (accepted + RELIABILITY_PRIOR * RELIABILITY_BASELINE) /
    (accepted + rejected + RELIABILITY_PRIOR);
  return clamp(Math.round(smoothed * 100));
}

export async function getFarmerReliabilityScores(
  farmerIds: Array<Types.ObjectId | string>
): Promise<Map<string, number>> {
  const ids = farmerIds.map(toObjectId);
  const scores = new Map<string, number>();
  if (ids.length === 0) return scores;

  const rows = await Match.aggregate<{
    _id: Types.ObjectId;
    accepted: number;
    rejected: number;
  }>([
    {
      $match: {
        farmerId: { $in: ids },
        status: { $in: ['accepted', 'rejected'] },
      },
    },
    {
      $group: {
        _id: '$farmerId',
        accepted: { $sum: { $cond: [{ $eq: ['$status', 'accepted'] }, 1, 0] } },
        // Only rejections the *farmer* made say anything about the farmer's own
        // reliability; a buyer walking away must not count against them.
        rejected: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ['$status', 'rejected'] },
                  { $eq: ['$rejectedById', '$farmerId'] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);

  for (const row of rows) {
    scores.set(
      row._id.toString(),
      reliabilityFromOutcomes(row.accepted, row.rejected)
    );
  }
  for (const id of ids) {
    const key = id.toString();
    if (!scores.has(key)) scores.set(key, NEUTRAL_RELIABILITY);
  }

  return scores;
}

export async function getFarmerReliabilityScore(
  farmerId: Types.ObjectId | string
): Promise<number> {
  const id = toObjectId(farmerId);
  const scores = await getFarmerReliabilityScores([id]);
  return scores.get(id.toString()) ?? NEUTRAL_RELIABILITY;
}

function scoreLessThan(
  a: { scores: IMatchScoreBreakdown },
  b: { scores: IMatchScoreBreakdown }
): number {
  return b.scores.overallScore - a.scores.overallScore;
}

/**
 * Pushes a match lifecycle event to both parties: real time over their sockets
 * and persisted so an offline user does not miss it. Fire-and-forget — neither
 * channel is allowed to delay or fail the HTTP response.
 */
function emitMatchEvent(match: IMatch, event: NotificationType): void {
  const parties = [match.farmerId, match.buyerId].filter((id): id is Types.ObjectId =>
    Boolean(id)
  );
  void dispatchMatchEvent(parties, event, {
    matchId: match._id?.toString(),
    cropName: match.cropName,
    status: match.status,
    overallScore: match.scores?.overallScore,
  });
}

function buildMatchRecord(
  listing: ICropListing,
  requirement: IBuyerRequirement,
  scores: IMatchScoreBreakdown,
  hardResult: HardFilterResult,
  reliabilityScore: number,
  status: MatchStatus
): Partial<IMatch> {
  const now = Date.now();
  return {
    cropListingId: listing._id,
    buyerRequirementId: requirement._id,
    farmerId: listing.farmerId,
    buyerId: requirement.buyerId,
    cropName: listing.cropName,
    status,
    hardFilterPass: hardResult.pass,
    hardFilterFailures: hardResult.failures,
    scores,
    farmerReliabilityScore: reliabilityScore,
    matchExpiresAt: new Date(now + 1000 * 60 * 60 * 24 * 14),
  };
}

export async function runMatchingForListing(
  listingId: Types.ObjectId | string,
  farmerId: Types.ObjectId | string,
  options: { threshold: number; limitMatches: number }
): Promise<{
  evaluated: number;
  newMatches: number;
  matches: IMatch[];
}> {
  const listing = await CropListing.findOne({
    _id: toObjectId(listingId),
    isDeleted: { $ne: true },
  });
  if (!listing) {
    throw createError('Crop listing not found', 404, 'CROP_LISTING_NOT_FOUND');
  }
  if (!listing.farmerId || !listing.farmerId.equals(toObjectId(farmerId))) {
    throw createError(
      'Crop listing does not belong to authenticated farmer',
      403,
      'CROP_LISTING_FORBIDDEN'
    );
  }

  const candidateRequirements = await BuyerRequirement.find({
    status: 'open',
    isDeleted: { $ne: true },
  }).limit(200);

  const reliability = await getFarmerReliabilityScore(farmerId);
  const out: IMatch[] = [];
  let newMatches = 0;

  for (const req of candidateRequirements) {
    const hardResult = hardFilterPass(listing, req);
    if (!hardResult.pass) continue;
    const scores = computeScoreBreakdown(listing, req, reliability);
    if (scores.overallScore < options.threshold) continue;

    const existing = await Match.findOne({
      cropListingId: toObjectId(listingId),
      buyerRequirementId: req._id,
    });
    if (existing) {
      existing.scores = scores;
      existing.hardFilterFailures = hardResult.failures;
      existing.hardFilterPass = hardResult.pass;
      if (existing.status === 'rejected' || existing.status === 'expired') {
        existing.status = 'suggested';
      }
      await existing.save();
      out.push(existing);
      continue;
    }

    const rec = buildMatchRecord(
      listing,
      req,
      scores,
      hardResult,
      reliability,
      'suggested'
    );
    try {
      const created = await Match.create(rec);
      newMatches += 1;
      out.push(created);
      emitMatchEvent(created, 'match:new');
    } catch (_err) {
      const dup = await Match.findOne({
        cropListingId: toObjectId(listingId),
        buyerRequirementId: req._id,
      });
      if (dup) out.push(dup);
    }
  }

  out.sort(scoreLessThan);
  const matches = out.slice(0, options.limitMatches);

  return {
    evaluated: candidateRequirements.length,
    newMatches,
    matches,
  };
}

export async function runMatchingForRequirement(
  requirementId: Types.ObjectId | string,
  buyerId: Types.ObjectId | string,
  options: { threshold: number; limitMatches: number }
): Promise<{
  evaluated: number;
  newMatches: number;
  matches: IMatch[];
}> {
  const requirement = await BuyerRequirement.findOne({
    _id: toObjectId(requirementId),
    isDeleted: { $ne: true },
  });
  if (!requirement) {
    throw createError(
      'Buyer requirement not found',
      404,
      'BUYER_REQUIREMENT_NOT_FOUND'
    );
  }
  if (
    !requirement.buyerId ||
    !requirement.buyerId.equals(toObjectId(buyerId))
  ) {
    throw createError(
      'Buyer requirement does not belong to authenticated buyer',
      403,
      'BUYER_REQUIREMENT_FORBIDDEN'
    );
  }

  const candidateListings = await CropListing.find({
    status: 'active',
    isDeleted: { $ne: true },
  }).limit(200);

  const reliabilityByFarmer = await getFarmerReliabilityScores(
    candidateListings.map((listing) => listing.farmerId)
  );

  const out: IMatch[] = [];
  let newMatches = 0;

  for (const listing of candidateListings) {
    const hardResult = hardFilterPass(listing, requirement);
    if (!hardResult.pass) continue;
    const reliability =
      reliabilityByFarmer.get(listing.farmerId.toString()) ??
      NEUTRAL_RELIABILITY;
    const scores = computeScoreBreakdown(listing, requirement, reliability);
    if (scores.overallScore < options.threshold) continue;

    const existing = await Match.findOne({
      cropListingId: listing._id,
      buyerRequirementId: toObjectId(requirementId),
    });
    if (existing) {
      existing.scores = scores;
      existing.hardFilterFailures = hardResult.failures;
      existing.hardFilterPass = hardResult.pass;
      existing.farmerReliabilityScore = reliability;
      if (existing.status === 'rejected' || existing.status === 'expired') {
        existing.status = 'suggested';
      }
      await existing.save();
      out.push(existing);
      continue;
    }

    const rec = buildMatchRecord(
      listing,
      requirement,
      scores,
      hardResult,
      reliability,
      'suggested'
    );
    try {
      const created = await Match.create(rec);
      newMatches += 1;
      out.push(created);
      emitMatchEvent(created, 'match:new');
    } catch (_err) {
      const dup = await Match.findOne({
        cropListingId: listing._id,
        buyerRequirementId: toObjectId(requirementId),
      });
      if (dup) out.push(dup);
    }
  }

  out.sort(scoreLessThan);
  const matches = out.slice(0, options.limitMatches);

  return {
    evaluated: candidateListings.length,
    newMatches,
    matches,
  };
}

export async function listMatchesForUser(
  userId: Types.ObjectId | string,
  role: 'farmer' | 'buyer',
  query: MatchingQuery
): Promise<IMatch[]> {
  const uid = toObjectId(userId);
  const filter: Record<string, unknown> = {};
  filter[role === 'farmer' ? 'farmerId' : 'buyerId'] = uid;
  if (query.status) filter.status = query.status;
  const limit = Math.max(1, Math.min(50, query.limit ?? 20));
  return Match.find(filter).sort({ createdAt: -1 }).limit(limit);
}

export async function getMatchById(
  id: Types.ObjectId | string,
  userId?: Types.ObjectId | string,
  role?: 'farmer' | 'buyer'
): Promise<IMatch | null> {
  const filter: Record<string, unknown> = { _id: toObjectId(id) };
  if (userId && role) {
    filter[role === 'farmer' ? 'farmerId' : 'buyerId'] = toObjectId(userId);
  }
  return Match.findOne(filter);
}

export async function acceptMatch(
  id: Types.ObjectId | string,
  userId: Types.ObjectId | string,
  role: 'farmer' | 'buyer'
): Promise<IMatch> {
  const match = await Match.findOne({
    _id: toObjectId(id),
    $or: [{ farmerId: toObjectId(userId) }, { buyerId: toObjectId(userId) }],
  });
  if (!match) {
    throw createError('Match not found', 404, 'MATCH_NOT_FOUND');
  }
  if (match.status === 'rejected' || match.status === 'expired') {
    throw createError(
      `Match status=${match.status} cannot be accepted`,
      409,
      'MATCH_INVALID_STATE'
    );
  }

  if (role === 'farmer') match.farmerViewedAt = new Date();
  else match.buyerViewedAt = new Date();

  if (match.status === 'suggested') {
    match.status = 'pending';
  } else if (match.status === 'pending') {
    const bothViewed = match.farmerViewedAt && match.buyerViewedAt;
    if (bothViewed) match.status = 'accepted';
  }
  await match.save();
  emitMatchEvent(
    match,
    match.status === 'accepted' ? 'match:accepted' : 'match:pending'
  );
  return match;
}

export async function rejectMatch(
  id: Types.ObjectId | string,
  userId: Types.ObjectId | string,
  reason?: string
): Promise<IMatch> {
  const match = await Match.findOne({
    _id: toObjectId(id),
    $or: [{ farmerId: toObjectId(userId) }, { buyerId: toObjectId(userId) }],
  });
  if (!match) {
    throw createError('Match not found', 404, 'MATCH_NOT_FOUND');
  }
  match.status = 'rejected';
  match.rejectedById = toObjectId(userId);
  if (reason) match.rejectedReason = reason;
  await match.save();
  emitMatchEvent(match, 'match:rejected');
  return match;
}
