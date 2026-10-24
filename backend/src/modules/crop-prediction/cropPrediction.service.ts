import { Types } from 'mongoose';
import {
  CropPrediction,
  CropPredictionDoc,
  ICropPrediction,
} from './cropPrediction.model';
import {
  GeneratePredictionInput,
  PredictionQuery,
} from './cropPrediction.schema';
import {
  CropKnowledgeEntry,
  findCropInKnowledgeBase,
} from '../crop-recommendation/cropKnowledge';
import { FarmProfile } from '../users/farmProfile.model';
import { assertOwnership } from '../../utils/assertOwnership';
import { BuyerRequirement } from '../buyer-requirements/buyerRequirement.model';
import { findLiveMandiPrice } from '../market-prices/marketPrice.service';

const PREMIUM_BIAS = 1.1;
const STANDARD_BIAS = 1.0;
const ECONOMY_BIAS = 0.9;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

type AppError = Error & {
  statusCode?: number;
  code?: string;
  isOperational?: boolean;
};

function createError(
  message: string,
  statusCode: number,
  code: string
): AppError {
  const err = new Error(message) as AppError;
  err.statusCode = statusCode;
  err.code = code;
  err.isOperational = true;
  return err;
}

function toObjectId(id: Types.ObjectId | string): Types.ObjectId {
  return typeof id === 'string' ? new Types.ObjectId(id) : id;
}

function medianFromRange(range: [number, number]): number {
  return (range[0] + range[1]) / 2;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * Fallback price when no recent mandi quote is available: the midpoint of the
 * knowledge base's ±15% band around the crop's reference price.
 */
function knowledgeBasePrice(entry: CropKnowledgeEntry): number {
  const priceRange: [number, number] = [
    entry.pricePerKgInr * 0.85,
    entry.pricePerKgInr * 1.15,
  ];
  return medianFromRange(priceRange);
}

/**
 * Spellings to try against the Agmarknet feed. The knowledge base uses names
 * like "Rice (Paddy)" and "Mirchi (Chilli)" while Agmarknet publishes "Rice"
 * and "Chilli", so both the outer name and the parenthesised names are offered
 * (the latter split on `/` for entries like "Pigeon Pea / Toor Dal").
 */
function commodityCandidates(entry: CropKnowledgeEntry): string[] {
  const candidates = new Set<string>();
  const outer = entry.name.split('(')[0].trim();
  if (outer) candidates.add(outer);

  const inner = entry.name.match(/\(([^)]+)\)/)?.[1];
  if (inner) {
    for (const part of inner.split('/')) {
      const trimmed = part.trim();
      if (trimmed) candidates.add(trimmed);
    }
  }

  return [...candidates];
}

function applyGradeBias(basePrice: number, grade: string): number {
  const g = grade.trim().toLowerCase();
  if (g === 'premium') return round2(basePrice * PREMIUM_BIAS);
  if (g === 'economy') return round2(basePrice * ECONOMY_BIAS);
  return round2(basePrice * STANDARD_BIAS);
}

export async function generatePrediction(
  userId: Types.ObjectId | string,
  payload: GeneratePredictionInput
): Promise<CropPredictionDoc> {
  let location = payload.location;
  if (payload.farmProfileId) {
    const profile = await FarmProfile.findOne({
      _id: toObjectId(payload.farmProfileId),
      isDeleted: { $ne: true },
    })
      .select('farmerId state district')
      .lean();
    if (!profile) {
      throw createError('Farm profile not found', 404, 'PROFILE_NOT_FOUND');
    }
    assertOwnership(
      typeof userId === 'string' ? userId : userId.toString(),
      'farmer',
      profile.farmerId as Types.ObjectId
    );
    if (!location) {
      location = {
        state: String(profile.state ?? ''),
        district: String(profile.district ?? ''),
      };
    }
  }

  if (!location || !location.state || !location.district) {
    throw createError(
      'Location (state + district) is required',
      400,
      'LOCATION_REQUIRED'
    );
  }

  const cropEntry = findCropInKnowledgeBase(payload.cropName);
  if (!cropEntry) {
    throw createError(
      `Crop "${payload.cropName}" not found in knowledge base`,
      404,
      'CROP_NOT_FOUND_IN_KB'
    );
  }

  const yieldUserSupplied = payload.estimatedYieldQty !== undefined;
  const priceUserSupplied = payload.expectedPricePerUnit !== undefined;
  const costUserSupplied = payload.estimatedTotalCost !== undefined;

  const yieldRange = [
    Math.max(0, cropEntry.yieldKgPerAcre * 0.8),
    cropEntry.yieldKgPerAcre * 1.2,
  ] as [number, number];
  const investmentRange = [
    Math.max(0, cropEntry.costPerAcreInr * 0.85),
    cropEntry.costPerAcreInr * 1.15,
  ] as [number, number];

  const estimatedYieldQty = round2(
    yieldUserSupplied
      ? Number(payload.estimatedYieldQty)
      : medianFromRange(yieldRange) * payload.farmSizeAcres
  );

  // Revenue uses a live mandi price when one is on hand, because a static
  // knowledge-base figure ignores the market the farmer is actually selling
  // into. A user-supplied price always wins; otherwise a missing or stale
  // Agmarknet feed falls back to the knowledge base and says so.
  const liveMandi = priceUserSupplied
    ? null
    : await findLiveMandiPrice({
        commodityNames: commodityCandidates(cropEntry),
        state: location.state,
        district: location.district,
      });

  const rawPriceBase = priceUserSupplied
    ? Number(payload.expectedPricePerUnit)
    : liveMandi?.pricePerKg ?? knowledgeBasePrice(cropEntry);

  const priceSource: 'mandi' | 'knowledge_base' | 'user' = priceUserSupplied
    ? 'user'
    : liveMandi
      ? 'mandi'
      : 'knowledge_base';

  const expectedPricePerUnit = applyGradeBias(
    rawPriceBase,
    payload.qualityGrade
  );
  const estimatedTotalCost = round2(
    costUserSupplied
      ? Number(payload.estimatedTotalCost)
      : medianFromRange(investmentRange) * payload.farmSizeAcres
  );

  const estimatedTotalRevenue = round2(
    estimatedYieldQty * expectedPricePerUnit
  );
  const estimatedNetProfit = round2(
    estimatedTotalRevenue - estimatedTotalCost
  );
  const profitPerAcre = round2(estimatedNetProfit / payload.farmSizeAcres);
  const yieldPerAcre = round2(estimatedYieldQty / payload.farmSizeAcres);
  const roiPercent =
    estimatedTotalCost > 0
      ? round2((estimatedNetProfit / estimatedTotalCost) * 100)
      : 0;
  const breakEvenPricePerUnit =
    estimatedYieldQty > 0
      ? round2(estimatedTotalCost / estimatedYieldQty)
      : 0;

  const buyerLimit = Math.min(
    20,
    Math.max(1, payload.limitRecommendedBuyers ?? 10)
  );
  const districtNorm = location.district.trim().toLowerCase();
  const stateNorm = location.state.trim().toLowerCase();
  const buyerMatchFilter: Record<string, unknown> = {
    status: 'open',
    isDeleted: { $ne: true },
    cropName: {
      $regex: escapeRegex(cropEntry.name.split(' (')[0].trim()),
      $options: 'i',
    },
    $or: [
      { 'location.state': { $regex: escapeRegex(stateNorm), $options: 'i' } },
      {
        'location.district': {
          $regex: escapeRegex(districtNorm),
          $options: 'i',
        },
      },
    ],
  };
  const matchingRequirements = await BuyerRequirement.find(buyerMatchFilter)
    .sort({ requiredByDate: 1 })
    .limit(buyerLimit)
    .select('_id')
    .lean();
  const recommendedBuyerIds = matchingRequirements.map((r) => r._id);

  const now = new Date();
  const expires = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  const saved = await CropPrediction.create({
    userId: toObjectId(userId),
    farmProfileId: payload.farmProfileId
      ? toObjectId(payload.farmProfileId)
      : undefined,
    cropName: cropEntry.name,
    cropVariety: payload.cropVariety,
    location,
    farmSizeAcres: payload.farmSizeAcres,
    qualityGrade: payload.qualityGrade,
    estimatedYieldQty,
    yieldUnit: 'kg',
    expectedPricePerUnit,
    priceCurrency: 'INR',
    priceSource,
    priceReference: liveMandi
      ? {
          commodity: liveMandi.commodity,
          mandiName: liveMandi.mandiName,
          district: liveMandi.district,
          state: liveMandi.state,
          priceDate: liveMandi.priceDate,
        }
      : undefined,
    estimatedTotalCost,
    estimatedTotalRevenue,
    estimatedNetProfit,
    profitPerAcre,
    yieldPerAcre,
    roiPercent,
    breakEvenPricePerUnit,
    recommendedBuyerIds,
    inputs: {
      yieldUserSupplied,
      priceUserSupplied,
      costUserSupplied,
    },
    generatedAt: now,
    expiresAt: expires,
    isDeleted: false,
  });

  await saved.populate({
    path: 'recommendedBuyerIds',
    select:
      'cropName quantityKg maxPricePerKg qualityGrade location requiredByDate buyerId',
    populate: {
      path: 'buyerId',
      select: 'fullName phone',
    },
  });

  return saved;
}

export async function listMyPredictions(
  userId: Types.ObjectId | string,
  query: PredictionQuery
): Promise<Array<CropPredictionDoc & { toObject: () => ICropPrediction }>> {
  const filter: Record<string, unknown> = {
    userId: toObjectId(userId),
    isDeleted: query.status === 'deleted',
  };

  if (query.cropName) {
    filter.cropName = {
      $regex: escapeRegex(query.cropName.trim()),
      $options: 'i',
    };
  }

  const limit = Math.max(1, Math.min(50, query.limit ?? 20));
  const sort = query.sort === 'oldest' ? { generatedAt: 1 } : { generatedAt: -1 };

  const results = await CropPrediction.find(filter)
    .sort(sort as Record<string, 1 | -1>)
    .limit(limit)
    .populate({
      path: 'recommendedBuyerIds',
      select:
        'cropName quantityKg maxPricePerKg qualityGrade location requiredByDate buyerId',
      populate: {
        path: 'buyerId',
        select: 'fullName phone',
      },
    });

  return results as Array<
    CropPredictionDoc & { toObject: () => ICropPrediction }
  >;
}

export async function getPredictionById(
  id: Types.ObjectId | string,
  userId: Types.ObjectId | string
): Promise<
  | (CropPredictionDoc & { toObject: () => ICropPrediction })
  | null
> {
  const result = await CropPrediction.findOne({
    _id: toObjectId(id),
    userId: toObjectId(userId),
    isDeleted: false,
  }).populate({
    path: 'recommendedBuyerIds',
    select:
      'cropName quantityKg maxPricePerKg qualityGrade location requiredByDate buyerId',
    populate: {
      path: 'buyerId',
      select: 'fullName phone',
    },
  });
  return result as
    | (CropPredictionDoc & { toObject: () => ICropPrediction })
    | null;
}

export async function softDeletePrediction(
  id: Types.ObjectId | string,
  userId: Types.ObjectId | string
): Promise<
  | (CropPredictionDoc & { toObject: () => ICropPrediction })
  | null
> {
  const updated = await CropPrediction.findOneAndUpdate(
    {
      _id: toObjectId(id),
      userId: toObjectId(userId),
      isDeleted: false,
    },
    { $set: { isDeleted: true, deletedAt: new Date() } },
    { new: true }
  ).populate({
    path: 'recommendedBuyerIds',
    select:
      'cropName quantityKg maxPricePerKg qualityGrade location requiredByDate buyerId',
    populate: {
      path: 'buyerId',
      select: 'fullName phone',
    },
  });
  return updated as
    | (CropPredictionDoc & { toObject: () => ICropPrediction })
    | null;
}

export { PREMIUM_BIAS, STANDARD_BIAS, ECONOMY_BIAS, median, medianFromRange };
