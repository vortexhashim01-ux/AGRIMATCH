import { Types } from 'mongoose';
import { CropListing, ICropListing } from './cropListing.model';
import { CropListingInput, CropListingQuery, CropListingUpdateInput } from './cropListing.schema';

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

export function buildListingFilter(
  input: CropListingQuery,
  options?: { includeDeleted?: boolean; farmerId?: Types.ObjectId | string }
): Record<string, unknown> {
  const filter: Record<string, unknown> = {};

  if (!options?.includeDeleted) {
    filter.isDeleted = { $ne: true };
  }

  if (options?.farmerId) {
    filter.farmerId = toObjectId(options.farmerId);
  }

  if (input.status) {
    filter.status = input.status;
  } else if (!options?.farmerId) {
    filter.status = 'active';
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
    filter.expectedPricePerKg = priceFilter;
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

export async function createCropListing(
  farmerId: Types.ObjectId | string,
  input: CropListingInput
): Promise<ICropListing> {
  return CropListing.create({
    ...input,
    farmerId: toObjectId(farmerId),
    status: 'active',
    isDeleted: false,
  });
}

export async function searchCropListings(
  input: CropListingQuery,
  options?: { includeDeleted?: boolean; farmerId?: Types.ObjectId | string }
): Promise<ICropListing[]> {
  const filter = buildListingFilter(input, options);
  const limit = Math.max(1, Math.min(50, input.limit ?? 20));

  return CropListing.find(filter).sort({ createdAt: -1 }).limit(limit);
}

export async function getCropListingById(
  id: Types.ObjectId | string
): Promise<ICropListing | null> {
  return CropListing.findById(id);
}

export async function updateCropListing(
  id: Types.ObjectId | string,
  farmerId: Types.ObjectId | string,
  input: CropListingUpdateInput
): Promise<ICropListing> {
  const existing = await CropListing.findOne({
    _id: toObjectId(id),
    farmerId: toObjectId(farmerId),
    isDeleted: { $ne: true },
  });

  if (!existing) {
    throw createError('Crop listing not found', 404, 'CROP_LISTING_NOT_FOUND');
  }

  const updated = await CropListing.findByIdAndUpdate(id, input, {
    new: true,
    runValidators: true,
  });

  if (!updated) {
    throw createError('Crop listing not found', 404, 'CROP_LISTING_NOT_FOUND');
  }

  return updated;
}

export async function setCropListingStatus(
  id: Types.ObjectId | string,
  farmerId: Types.ObjectId | string,
  status: ICropListing['status']
): Promise<ICropListing> {
  const existing = await CropListing.findOne({
    _id: toObjectId(id),
    farmerId: toObjectId(farmerId),
    isDeleted: { $ne: true },
  });

  if (!existing) {
    throw createError('Crop listing not found', 404, 'CROP_LISTING_NOT_FOUND');
  }

  existing.status = status;
  await existing.save();
  return existing;
}

export async function approveCropListing(
  id: Types.ObjectId | string,
  farmerId: Types.ObjectId | string
): Promise<ICropListing> {
  const existing = await CropListing.findOne({
    _id: toObjectId(id),
    farmerId: toObjectId(farmerId),
  });

  if (!existing) {
    throw createError('Crop listing not found', 404, 'CROP_LISTING_NOT_FOUND');
  }

  existing.isDeleted = false;
  existing.status = 'active';
  await existing.save();
  return existing;
}

export async function discardCropListing(
  id: Types.ObjectId | string,
  farmerId: Types.ObjectId | string
): Promise<void> {
  const existing = await CropListing.findOne({
    _id: toObjectId(id),
    farmerId: toObjectId(farmerId),
    isDeleted: { $ne: true },
  });

  if (!existing) {
    throw createError('Crop listing not found', 404, 'CROP_LISTING_NOT_FOUND');
  }

  existing.isDeleted = true;
  await existing.save();
}
