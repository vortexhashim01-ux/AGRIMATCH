import { Types } from 'mongoose';
import {
  CropRecommendation,
  ICropRecommendation,
  IRecommendedCrop,
} from './cropRecommendation.model';
import {
  CropRecommendationQuery,
  GenerateCropRecommendationInput,
} from './cropRecommendation.schema';
import { FarmProfile } from '../users/farmProfile.model';
import { CROP_DB, CropKnowledgeEntry, cropMatchesQuery } from './cropKnowledge';

type SoilType = GenerateCropRecommendationInput['soilType'];
type Season = GenerateCropRecommendationInput['season'];
type IrrigationType = NonNullable<
  GenerateCropRecommendationInput['irrigationType']
>;

type CropProfile = CropKnowledgeEntry;

interface ScoredCrop {
  _score: number;
  cropName: string;
  matchScore: number;
  estimatedYieldPerAcre: number;
  estimatedPricePerKg: number;
  estimatedProfitPerAcre: number;
  riskLevel: 'low' | 'medium' | 'high';
  growthDurationDays: number;
  waterRequirement: 'low' | 'medium' | 'high';
  reasons: string[];
}

const AP_STATE_PATTERN = /andhra\s*pradesh|^ap$/i;

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

function fillApDefaults(
  input: GenerateCropRecommendationInput
): Required<
  Omit<
    GenerateCropRecommendationInput,
    | 'cropPreferences'
    | 'avoidCrops'
    | 'previousCrop'
    | 'isOrganicPreferred'
    | 'expectedSellingPricePerKg'
  >
> &
  Pick<GenerateCropRecommendationInput, 'cropPreferences'> &
  Pick<GenerateCropRecommendationInput, 'avoidCrops'> &
  Pick<GenerateCropRecommendationInput, 'previousCrop'> &
  Pick<GenerateCropRecommendationInput, 'isOrganicPreferred'> &
  Pick<GenerateCropRecommendationInput, 'expectedSellingPricePerKg'> {
  const soilPH =
    input.soilPH ??
    (input.soilType === 'black'
      ? 7.6
      : input.soilType === 'alluvial'
      ? 6.9
      : input.soilType === 'peat'
      ? 5.4
      : input.soilType === 'saline'
      ? 8.2
      : input.soilType === 'laterite'
      ? 5.8
      : input.soilType === 'desert'
      ? 8.0
      : input.soilType === 'mountain'
      ? 6.2
      : 6.4);
  return {
    farmProfileId: input.farmProfileId,
    totalLandArea: input.totalLandArea,
    landUnit: input.landUnit ?? 'acre',
    soilType: input.soilType,
    season: input.season,
    location: {
      state: input.location.state,
      district: input.location.district,
      pincode: input.location.pincode ?? '500001',
    },
    soilPH,
    soilNitrogen: input.soilNitrogen ?? (input.soilType === 'black' ? 120 : input.soilType === 'alluvial' ? 160 : 90),
    soilPhosphorus: input.soilPhosphorus ?? (input.soilType === 'black' ? 45 : input.soilType === 'alluvial' ? 55 : 30),
    soilPotassium: input.soilPotassium ?? (input.soilType === 'black' ? 210 : input.soilType === 'alluvial' ? 240 : 150),
    soilOrganicMatter: input.soilOrganicMatter ?? 0.9,
    climateZone: input.climateZone ?? 'Tropical Savanna (Aw) - Telangana & Rayalaseema',
    averageRainfallMm: input.averageRainfallMm ?? 1050,
    irrigationType: input.irrigationType ?? 'canal',
    irrigationFrequencyPerWeek: input.irrigationFrequencyPerWeek ?? 3,
    previousCrop: input.previousCrop ?? '',
    budgetPerAcre: input.budgetPerAcre ?? 36000,
    cropPreferences: input.cropPreferences ?? [],
    avoidCrops: input.avoidCrops ?? [],
    isOrganicPreferred: input.isOrganicPreferred ?? false,
    expectedSellingPricePerKg: input.expectedSellingPricePerKg,
  };
}

export function generateRuleBasedRecommendations(
  rawInput: GenerateCropRecommendationInput,
  topCount = 5
): {
  recommendations: IRecommendedCrop[];
  aiConfidence: number;
  aiModelVersion: string;
  totalEvaluated: number;
} {
  const input = fillApDefaults(rawInput);
  const districtNorm = input.location.district.trim().toLowerCase();
  const isAp =
    AP_STATE_PATTERN.test(input.location.state.trim()) ||
    CROP_DB.some((c) =>
      c.preferredDistricts?.some((d) => d === districtNorm)
    );

  const scored: ScoredCrop[] = CROP_DB.map((crop) => {
    const reasons: string[] = [];
    let score = 0;

    const soilMatch = crop.suitableSoils.includes(input.soilType);
    if (soilMatch) {
      score += 24;
      reasons.push(`Well-suited for ${input.soilType} soil in your farm`);
    } else {
      score -= 20;
      reasons.push(`${crop.name} usually performs better in ${crop.suitableSoils.slice(0, 2).join('/')} soil`);
    }

    const seasonMatch = crop.suitableSeasons.includes(input.season);
    if (seasonMatch) {
      score += 22;
      reasons.push(`${input.season} season is a recommended planting window`);
    } else {
      score -= 15;
      reasons.push(`${crop.suitableSeasons[0]} is the typical season for ${crop.name}`);
    }

    if (
      input.averageRainfallMm >= crop.minRainfallMm &&
      input.averageRainfallMm <= crop.maxRainfallMm
    ) {
      score += 12;
      reasons.push(
        `Average rainfall ${input.averageRainfallMm}mm is within ideal range`
      );
    } else if (input.averageRainfallMm < crop.minRainfallMm) {
      score -= 8;
      reasons.push(
        `Below ideal rainfall; ${crop.needsIrrigation ? 'supplemental irrigation required' : 'risky under rainfed'}`
      );
    } else {
      score -= 4;
      reasons.push('Rainfall is high — ensure proper drainage');
    }

    if (crop.suitableIrrigations?.includes(input.irrigationType)) {
      score += 6;
      reasons.push(
        `Works well with your ${input.irrigationType} irrigation setup`
      );
    }

    if (isAp && crop.apStateBoost) {
      score += crop.apStateBoost;
      reasons.push(
        `Regional advantage: top performing crop in Andhra Pradesh markets`
      );
    }

    if (
      crop.preferredDistricts &&
      crop.preferredDistricts.some((d) => d === districtNorm)
    ) {
      score += 8;
      reasons.push(
        `Your district (${input.location.district}) is a known high-yield belt for ${crop.name}`
      );
    }

    if (
      input.cropPreferences &&
      input.cropPreferences.some((pref) => cropMatchesQuery(crop, pref))
    ) {
      score += 10;
      reasons.push('Matches your listed crop preferences');
    }
    if (
      input.avoidCrops &&
      input.avoidCrops.some((avoid) => cropMatchesQuery(crop, avoid))
    ) {
      score -= 50;
      reasons.push('Excluded because it appears in your avoid crops list');
    }

    if (input.isOrganicPreferred && crop.organicFriendly) {
      score += 6;
      reasons.push('Organic-friendly with good market demand in organic segment');
    } else if (input.isOrganicPreferred && !crop.organicFriendly) {
      score -= 6;
      reasons.push('Typically uses fertilizers/pesticides; harder to certify organic');
    }

    if (
      input.budgetPerAcre &&
      input.budgetPerAcre < crop.costPerAcreInr
    ) {
      score -= 6;
      reasons.push(
        `Budget ₹${input.budgetPerAcre}/acre is below typical cost ₹${crop.costPerAcreInr}/acre`
      );
    } else {
      score += 6;
      reasons.push(
        `Typical cost ₹${crop.costPerAcreInr}/acre fits your budget`
      );
    }

    score = Math.max(0, Math.min(100, Math.round(score)));
    const estProfit = Math.max(
      0,
      crop.yieldKgPerAcre * crop.pricePerKgInr - crop.costPerAcreInr
    );

    return {
      _score: score,
      cropName: crop.name,
      matchScore: score,
      estimatedYieldPerAcre: crop.yieldKgPerAcre,
      estimatedPricePerKg: crop.pricePerKgInr,
      estimatedProfitPerAcre: estProfit,
      riskLevel: crop.risk,
      growthDurationDays: crop.durationDays,
      waterRequirement: crop.waterReq,
      reasons,
    };
  }).sort((a, b) => b._score - a._score);

  const top: IRecommendedCrop[] = scored
    .filter((s) => s._score > 0)
    .slice(0, topCount)
    .map((s) => ({
      cropName: s.cropName,
      matchScore: s.matchScore,
      estimatedYieldPerAcre: s.estimatedYieldPerAcre,
      estimatedPricePerKg: s.estimatedPricePerKg,
      estimatedProfitPerAcre: s.estimatedProfitPerAcre,
      riskLevel: s.riskLevel,
      growthDurationDays: s.growthDurationDays,
      waterRequirement: s.waterRequirement,
      reasons: s.reasons,
    }));

  const rawTop = scored.slice(0, topCount);
  const avgMatch =
    rawTop.reduce((acc, r) => acc + r.matchScore, 0) / Math.max(1, rawTop.length);
  const confidence = Math.min(100, Math.round(avgMatch));

  return {
    recommendations: top,
    aiConfidence: confidence,
    aiModelVersion: 'rule-based-ap-v1',
    totalEvaluated: CROP_DB.length,
  };
}

export async function assertFarmProfileOwnership(
  farmProfileId: Types.ObjectId | string,
  farmerId: Types.ObjectId | string
): Promise<void> {
  const fp = await FarmProfile.findOne({
    _id: toObjectId(farmProfileId),
    isDeleted: { $ne: true },
  }).select('farmerId');
  if (!fp) {
    throw createError('Farm profile not found', 404, 'FARM_PROFILE_NOT_FOUND');
  }
  if (!fp.farmerId || !fp.farmerId.equals(toObjectId(farmerId))) {
    throw createError(
      'Farm profile does not belong to authenticated user',
      403,
      'FARM_PROFILE_FORBIDDEN'
    );
  }
}

export async function generateCropRecommendation(
  farmerId: Types.ObjectId | string,
  rawInput: GenerateCropRecommendationInput
): Promise<ICropRecommendation> {
  await assertFarmProfileOwnership(rawInput.farmProfileId, farmerId);
  const input = fillApDefaults(rawInput);
  const {
    recommendations,
    aiConfidence,
    aiModelVersion,
  } = generateRuleBasedRecommendations(rawInput, 5);

  return CropRecommendation.create({
    farmerId: toObjectId(farmerId),
    farmProfileId: toObjectId(input.farmProfileId),
    state: input.location.state,
    district: input.location.district,
    pincode: input.location.pincode,
    totalLandArea: input.totalLandArea,
    landUnit: input.landUnit,
    soilType: input.soilType,
    soilPH: input.soilPH,
    soilNitrogen: input.soilNitrogen,
    soilPhosphorus: input.soilPhosphorus,
    soilPotassium: input.soilPotassium,
    soilOrganicMatter: input.soilOrganicMatter,
    climateZone: input.climateZone,
    averageRainfallMm: input.averageRainfallMm,
    season: input.season,
    irrigationType: input.irrigationType,
    irrigationFrequencyPerWeek: input.irrigationFrequencyPerWeek,
    previousCrop: input.previousCrop,
    budgetPerAcre: input.budgetPerAcre,
    cropPreferences: input.cropPreferences ?? [],
    avoidCrops: input.avoidCrops ?? [],
    isOrganicPreferred: input.isOrganicPreferred ?? false,
    expectedSellingPricePerKg: input.expectedSellingPricePerKg,
    recommendations,
    aiConfidence,
    aiModelVersion,
    isRecommended: recommendations.length > 0,
  });
}

export async function listCropRecommendationsForFarmer(
  farmerId: Types.ObjectId | string,
  query: CropRecommendationQuery
): Promise<ICropRecommendation[]> {
  const limit = Math.max(1, Math.min(50, query.limit ?? 20));
  return CropRecommendation.find({
    farmerId: toObjectId(farmerId),
  })
    .sort({ createdAt: -1 })
    .limit(limit);
}

export async function getCropRecommendationById(
  id: Types.ObjectId | string,
  farmerId?: Types.ObjectId | string
): Promise<ICropRecommendation | null> {
  const filter: Record<string, unknown> = { _id: toObjectId(id) };
  if (farmerId) {
    filter.farmerId = toObjectId(farmerId);
  }
  return CropRecommendation.findOne(filter);
}
