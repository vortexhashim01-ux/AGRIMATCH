type SoilType =
  | 'alluvial'
  | 'black'
  | 'red'
  | 'laterite'
  | 'desert'
  | 'mountain'
  | 'peat'
  | 'saline';

type Season =
  | 'kharif'
  | 'rabi'
  | 'zaid'
  | 'summer'
  | 'winter'
  | 'whole_year';

type IrrigationType =
  | 'rainfed'
  | 'canal'
  | 'borewell'
  | 'drip'
  | 'sprinkler'
  | 'tank'
  | 'well';

export interface CropRecommendationInput {
  soilType: SoilType;
  season: Season;
  state: string;
  totalLandArea: number;
  budgetPerAcre: number;
  averageRainfallMm: number;
  irrigationType: IrrigationType;
  cropPreferences?: string[];
  isOrganicPreferred?: boolean;
}

interface CropProfile {
  name: string;
  suitableSoils: SoilType[];
  suitableSeasons: Season[];
  minRainfallMm: number;
  maxRainfallMm: number;
  needsIrrigation: boolean;
  yieldKgPerAcre: number;
  pricePerKgInr: number;
  costPerAcreInr: number;
  durationDays: number;
  waterReq: 'low' | 'medium' | 'high';
  risk: 'low' | 'medium' | 'high';
  organicFriendly: boolean;
}

interface ScoredCrop {
  _score: number;
  cropName: string;
  matchScore: number;
  estimatedYieldPerAcreKg: number;
  estimatedPricePerKgInr: number;
  estimatedCostPerAcreInr: number;
  estimatedProfitPerAcreInr: number;
  riskLevel: 'low' | 'medium' | 'high';
  growthDurationDays: number;
  waterRequirement: 'low' | 'medium' | 'high';
  reasons: string[];
}

interface CropRecommendationOutput {
  generatedAt: string;
  input: CropRecommendationInput;
  model: string;
  totalCropsEvaluated: number;
  topCrops: Omit<ScoredCrop, '_score'>[];
  summary: string;
}

const CROP_DB: CropProfile[] = [
  {
    name: 'Rice (Paddy)',
    suitableSoils: ['alluvial', 'peat', 'saline', 'black'],
    suitableSeasons: ['kharif', 'summer', 'whole_year'],
    minRainfallMm: 600,
    maxRainfallMm: 2500,
    needsIrrigation: true,
    yieldKgPerAcre: 2500,
    pricePerKgInr: 22,
    costPerAcreInr: 32000,
    durationDays: 120,
    waterReq: 'high',
    risk: 'medium',
    organicFriendly: true,
  },
  {
    name: 'Wheat',
    suitableSoils: ['alluvial', 'black'],
    suitableSeasons: ['rabi', 'winter'],
    minRainfallMm: 300,
    maxRainfallMm: 900,
    needsIrrigation: true,
    yieldKgPerAcre: 2200,
    pricePerKgInr: 28,
    costPerAcreInr: 28000,
    durationDays: 135,
    waterReq: 'medium',
    risk: 'low',
    organicFriendly: true,
  },
  {
    name: 'Soybean',
    suitableSoils: ['black', 'alluvial', 'red'],
    suitableSeasons: ['kharif', 'summer'],
    minRainfallMm: 400,
    maxRainfallMm: 1200,
    needsIrrigation: false,
    yieldKgPerAcre: 1200,
    pricePerKgInr: 48,
    costPerAcreInr: 22000,
    durationDays: 110,
    waterReq: 'medium',
    risk: 'medium',
    organicFriendly: true,
  },
  {
    name: 'Cotton',
    suitableSoils: ['black', 'alluvial', 'red'],
    suitableSeasons: ['kharif', 'zaid', 'summer'],
    minRainfallMm: 500,
    maxRainfallMm: 1400,
    needsIrrigation: true,
    yieldKgPerAcre: 900,
    pricePerKgInr: 75,
    costPerAcreInr: 40000,
    durationDays: 180,
    waterReq: 'medium',
    risk: 'high',
    organicFriendly: false,
  },
  {
    name: 'Sugarcane',
    suitableSoils: ['alluvial', 'black', 'peat'],
    suitableSeasons: ['whole_year', 'summer', 'winter'],
    minRainfallMm: 800,
    maxRainfallMm: 2500,
    needsIrrigation: true,
    yieldKgPerAcre: 24000,
    pricePerKgInr: 3.5,
    costPerAcreInr: 65000,
    durationDays: 360,
    waterReq: 'high',
    risk: 'medium',
    organicFriendly: false,
  },
  {
    name: 'Tomato',
    suitableSoils: ['alluvial', 'red', 'black'],
    suitableSeasons: ['kharif', 'rabi', 'summer', 'zaid'],
    minRainfallMm: 400,
    maxRainfallMm: 1200,
    needsIrrigation: true,
    yieldKgPerAcre: 6000,
    pricePerKgInr: 18,
    costPerAcreInr: 35000,
    durationDays: 110,
    waterReq: 'medium',
    risk: 'high',
    organicFriendly: true,
  },
  {
    name: 'Potato',
    suitableSoils: ['alluvial', 'red', 'black'],
    suitableSeasons: ['rabi', 'winter'],
    minRainfallMm: 300,
    maxRainfallMm: 800,
    needsIrrigation: true,
    yieldKgPerAcre: 9000,
    pricePerKgInr: 15,
    costPerAcreInr: 30000,
    durationDays: 110,
    waterReq: 'medium',
    risk: 'medium',
    organicFriendly: true,
  },
  {
    name: 'Maize (Corn)',
    suitableSoils: ['alluvial', 'black', 'red', 'laterite'],
    suitableSeasons: ['kharif', 'rabi', 'summer'],
    minRainfallMm: 400,
    maxRainfallMm: 1000,
    needsIrrigation: true,
    yieldKgPerAcre: 2000,
    pricePerKgInr: 24,
    costPerAcreInr: 26000,
    durationDays: 115,
    waterReq: 'medium',
    risk: 'low',
    organicFriendly: true,
  },
  {
    name: 'Chickpea (Gram)',
    suitableSoils: ['black', 'alluvial', 'red'],
    suitableSeasons: ['rabi', 'winter'],
    minRainfallMm: 200,
    maxRainfallMm: 700,
    needsIrrigation: false,
    yieldKgPerAcre: 1000,
    pricePerKgInr: 65,
    costPerAcreInr: 18000,
    durationDays: 120,
    waterReq: 'low',
    risk: 'low',
    organicFriendly: true,
  },
  {
    name: 'Turmeric',
    suitableSoils: ['red', 'alluvial', 'laterite'],
    suitableSeasons: ['kharif', 'summer'],
    minRainfallMm: 600,
    maxRainfallMm: 2000,
    needsIrrigation: true,
    yieldKgPerAcre: 1800,
    pricePerKgInr: 180,
    costPerAcreInr: 50000,
    durationDays: 240,
    waterReq: 'medium',
    risk: 'high',
    organicFriendly: true,
  },
  {
    name: 'Groundnut',
    suitableSoils: ['red', 'alluvial', 'laterite'],
    suitableSeasons: ['kharif', 'summer', 'zaid'],
    minRainfallMm: 400,
    maxRainfallMm: 1200,
    needsIrrigation: false,
    yieldKgPerAcre: 1500,
    pricePerKgInr: 70,
    costPerAcreInr: 22000,
    durationDays: 120,
    waterReq: 'medium',
    risk: 'medium',
    organicFriendly: true,
  },
  {
    name: 'Red Gram (Tur / Pigeon Pea)',
    suitableSoils: ['black', 'red', 'alluvial'],
    suitableSeasons: ['kharif', 'whole_year'],
    minRainfallMm: 300,
    maxRainfallMm: 1000,
    needsIrrigation: false,
    yieldKgPerAcre: 900,
    pricePerKgInr: 80,
    costPerAcreInr: 18000,
    durationDays: 160,
    waterReq: 'low',
    risk: 'medium',
    organicFriendly: true,
  },
];

function score(
  profile: CropProfile,
  input: CropRecommendationInput
): { score: number; reasons: string[] } {
  let s = 0;
  const reasons: string[] = [];

  if (profile.suitableSoils.includes(input.soilType)) {
    s += 25;
    reasons.push(`Highly suited for ${input.soilType} soil`);
  } else {
    s -= 10;
    reasons.push(`${input.soilType} soil is not optimal`);
  }

  if (profile.suitableSeasons.includes(input.season)) {
    s += 20;
    reasons.push(`Suitable for ${input.season} season`);
  } else {
    s -= 15;
    reasons.push(`Not recommended for ${input.season} season`);
  }

  if (
    input.averageRainfallMm >= profile.minRainfallMm &&
    input.averageRainfallMm <= profile.maxRainfallMm
  ) {
    s += 10;
    reasons.push(`Matches rainfall profile (${input.averageRainfallMm}mm)`);
  } else if (input.averageRainfallMm < profile.minRainfallMm) {
    s -= 5;
    reasons.push(`Rainfall below crop's minimum; irrigation required`);
  }

  const irrigationBonus =
    input.irrigationType === 'rainfed'
      ? profile.needsIrrigation
        ? -8
        : 10
      : 8;
  s += irrigationBonus;
  if (irrigationBonus > 0) {
    reasons.push(`${input.irrigationType} irrigation support is sufficient`);
  }

  if (input.isOrganicPreferred && profile.organicFriendly) {
    s += 8;
    reasons.push(`Farmer-friendly for organic practices`);
  } else if (input.isOrganicPreferred && !profile.organicFriendly) {
    s -= 5;
    reasons.push(`Not ideal for fully organic farming`);
  }

  if (
    Array.isArray(input.cropPreferences) &&
    input.cropPreferences.length > 0
  ) {
    const matches = input.cropPreferences.some(
      (pref) =>
        pref && profile.name.toLowerCase().includes(pref.toLowerCase())
    );
    if (matches) {
      s += 12;
      reasons.push(`Matches farmer's stated crop preference list`);
    }
  }

  const revenuePerAcre = profile.yieldKgPerAcre * profile.pricePerKgInr;
  const profitPerAcre = revenuePerAcre - profile.costPerAcreInr;
  const budgetOk =
    profile.costPerAcreInr <= input.budgetPerAcre + 5000;
  if (budgetOk) {
    s += 10;
    reasons.push(
      `Within budget range (cost ~₹${profile.costPerAcreInr.toLocaleString('en-IN')}/acre)`
    );
  } else {
    s -= 8;
    reasons.push(
      `Cost ₹${profile.costPerAcreInr.toLocaleString('en-IN')} exceeds budget by a wide margin`
    );
  }

  if (profitPerAcre >= 50000) {
    s += 10;
    reasons.push(
      `High profit potential (~₹${profitPerAcre.toLocaleString('en-IN')}/acre gross)`
    );
  } else if (profitPerAcre >= 20000) {
    s += 5;
    reasons.push(
      `Moderate profit (~₹${profitPerAcre.toLocaleString('en-IN')}/acre gross)`
    );
  } else {
    s -= 3;
  }

  s = Math.max(0, Math.min(100, Math.round(s)));
  return { score: s, reasons };
}

export function buildRecommendation(
  input: CropRecommendationInput
): CropRecommendationOutput {
  const scored: ScoredCrop[] = CROP_DB.map((crop) => {
    const { score: s, reasons } = score(crop, input);
    const revenuePerAcre = crop.yieldKgPerAcre * crop.pricePerKgInr;
    return {
      _score: s,
      cropName: crop.name,
      matchScore: s,
      estimatedYieldPerAcreKg: Math.round(
        crop.yieldKgPerAcre * (0.85 + (s / 100) * 0.3)
      ),
      estimatedPricePerKgInr: Number(crop.pricePerKgInr.toFixed(2)),
      estimatedCostPerAcreInr: crop.costPerAcreInr,
      estimatedProfitPerAcreInr: Math.max(
        0,
        Math.round(revenuePerAcre - crop.costPerAcreInr)
      ),
      riskLevel: crop.risk,
      growthDurationDays: crop.durationDays,
      waterRequirement: crop.waterReq,
      reasons,
    };
  });

  scored.sort((a, b) => b._score - a._score);
  const top = scored
    .slice(0, 5)
    .map(({ _score, ...rest }) => rest);

  const summary =
    top.length > 0
      ? `Top recommendation for ${input.state} (${input.season}, ${input.soilType} soil, ${input.totalLandArea}ac): ${top[0].cropName} with match ${top[0].matchScore}%. Expected gross profit ~₹${top[0].estimatedProfitPerAcreInr.toLocaleString('en-IN')}/acre over ${top[0].growthDurationDays} days.`
      : 'No strong crop matches found for the input combination.';

  return {
    generatedAt: new Date().toISOString(),
    input,
    model: 'agrimatch-rule-based-v1',
    totalCropsEvaluated: CROP_DB.length,
    topCrops: top,
    summary,
  };
}
