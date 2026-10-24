import { Types } from 'mongoose';
import { BuyerRequirement, IBuyerRequirement } from './buyerRequirement.model';
import {
  BuyerRequirementInput,
  BuyerRequirementQuery,
  BuyerRequirementUpdateInput,
} from './buyerRequirement.schema';

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

export function buildRequirementFilter(
  input: BuyerRequirementQuery,
  options?: { includeDeleted?: boolean; buyerId?: Types.ObjectId | string }
): Record<string, unknown> {
  const filter: Record<string, unknown> = {};

  if (!options?.includeDeleted) {
    filter.isDeleted = { $ne: true };
  }

  if (options?.buyerId) {
    filter.buyerId = toObjectId(options.buyerId);
  }

  if (input.status) {
    filter.status = input.status;
  } else if (!options?.buyerId) {
    filter.status = 'open';
  }

  if (input.cropName) {
    filter.cropName = { $regex: input.cropName.trim(), $options: 'i' };
  }

  const priceFilter: Record<string, number> = {};
  if (input.minPricePerKg !== undefined) {
    priceFilter.$gte = Number(input.minPricePerKg);
  }
  if (input.maxPricePerKg !== undefined) {
    priceFilter.$lte = Number(input.maxPricePerKg);
  }
  if (Object.keys(priceFilter).length > 0) {
    filter.maxPricePerKg = priceFilter;
  }

  if (input.qualityGrade) {
    filter.qualityGrade = input.qualityGrade;
  }

  if (input.state) {
    filter['location.state'] = { $regex: input.state.trim(), $options: 'i' };
  }

  if (input.district) {
    filter['location.district'] = { $regex: input.district.trim(), $options: 'i' };
  }

  return filter;
}

export async function createBuyerRequirement(
  buyerId: Types.ObjectId | string,
  input: BuyerRequirementInput
): Promise<IBuyerRequirement> {
  return BuyerRequirement.create({
    ...input,
    buyerId: toObjectId(buyerId),
    status: 'open',
    isDeleted: false,
  });
}

export async function searchBuyerRequirements(
  input: BuyerRequirementQuery,
  options?: { includeDeleted?: boolean; buyerId?: Types.ObjectId | string }
): Promise<IBuyerRequirement[]> {
  const filter = buildRequirementFilter(input, options);
  const limit = Math.max(1, Math.min(50, input.limit ?? 20));

  return BuyerRequirement.find(filter).sort({ createdAt: -1 }).limit(limit);
}

export async function getBuyerRequirementById(
  id: Types.ObjectId | string
): Promise<IBuyerRequirement | null> {
  return BuyerRequirement.findById(id);
}

export async function updateBuyerRequirement(
  id: Types.ObjectId | string,
  buyerId: Types.ObjectId | string,
  input: BuyerRequirementUpdateInput
): Promise<IBuyerRequirement> {
  const existing = await BuyerRequirement.findOne({
    _id: toObjectId(id),
    buyerId: toObjectId(buyerId),
    isDeleted: { $ne: true },
  });

  if (!existing) {
    throw createError(
      'Buyer requirement not found',
      404,
      'BUYER_REQUIREMENT_NOT_FOUND'
    );
  }

  const updated = await BuyerRequirement.findByIdAndUpdate(id, input, {
    new: true,
    runValidators: true,
  });

  if (!updated) {
    throw createError(
      'Buyer requirement not found',
      404,
      'BUYER_REQUIREMENT_NOT_FOUND'
    );
  }

  return updated;
}

export async function setBuyerRequirementStatus(
  id: Types.ObjectId | string,
  buyerId: Types.ObjectId | string,
  status: IBuyerRequirement['status']
): Promise<IBuyerRequirement> {
  const existing = await BuyerRequirement.findOne({
    _id: toObjectId(id),
    buyerId: toObjectId(buyerId),
    isDeleted: { $ne: true },
  });

  if (!existing) {
    throw createError(
      'Buyer requirement not found',
      404,
      'BUYER_REQUIREMENT_NOT_FOUND'
    );
  }

  existing.status = status;
  await existing.save();
  return existing;
}

export async function approveBuyerRequirement(
  id: Types.ObjectId | string,
  buyerId: Types.ObjectId | string
): Promise<IBuyerRequirement> {
  const existing = await BuyerRequirement.findOne({
    _id: toObjectId(id),
    buyerId: toObjectId(buyerId),
  });

  if (!existing) {
    throw createError(
      'Buyer requirement not found',
      404,
      'BUYER_REQUIREMENT_NOT_FOUND'
    );
  }

  existing.isDeleted = false;
  existing.status = 'open';
  await existing.save();
  return existing;
}

export async function discardBuyerRequirement(
  id: Types.ObjectId | string,
  buyerId: Types.ObjectId | string
): Promise<void> {
  const existing = await BuyerRequirement.findOne({
    _id: toObjectId(id),
    buyerId: toObjectId(buyerId),
    isDeleted: { $ne: true },
  });

  if (!existing) {
    throw createError(
      'Buyer requirement not found',
      404,
      'BUYER_REQUIREMENT_NOT_FOUND'
    );
  }

  existing.isDeleted = true;
  await existing.save();
}
