import { FarmProfile, IFarmProfile } from './farmProfile.model';
import { FarmProfileInput } from './farmProfile.schema';
import { Types } from 'mongoose';

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

export async function createFarmProfile(
  farmerId: Types.ObjectId | string,
  input: FarmProfileInput
): Promise<IFarmProfile> {
  const farmerIdObj = typeof farmerId === 'string' ? new Types.ObjectId(farmerId) : farmerId;

  const existing = await FarmProfile.findOne({ farmerId: farmerIdObj });
  if (existing) {
    throw createError('Farm profile already exists for this farmer', 409, 'FARM_PROFILE_EXISTS');
  }

  return FarmProfile.create({
    ...input,
    farmerId: farmerIdObj,
  });
}

export async function getFarmProfileByFarmerId(
  farmerId: Types.ObjectId | string
): Promise<IFarmProfile | null> {
  const farmerIdObj = typeof farmerId === 'string' ? new Types.ObjectId(farmerId) : farmerId;
  return FarmProfile.findOne({ farmerId: farmerIdObj });
}

export async function getFarmProfileById(
  id: Types.ObjectId | string
): Promise<IFarmProfile | null> {
  return FarmProfile.findById(id);
}

export async function updateFarmProfile(
  id: Types.ObjectId | string,
  farmerId: Types.ObjectId | string,
  input: Partial<FarmProfileInput>
): Promise<IFarmProfile> {
  const idObj = typeof id === 'string' ? new Types.ObjectId(id) : id;
  const farmerIdObj = typeof farmerId === 'string' ? new Types.ObjectId(farmerId) : farmerId;

  const existing = await FarmProfile.findOne({ _id: idObj, farmerId: farmerIdObj });
  if (!existing) {
    throw createError('Farm profile not found', 404, 'FARM_PROFILE_NOT_FOUND');
  }

  const updated = await FarmProfile.findByIdAndUpdate(idObj, input, {
    new: true,
    runValidators: true,
  });

  if (!updated) {
    throw createError('Farm profile not found', 404, 'FARM_PROFILE_NOT_FOUND');
  }

  return updated;
}

export async function deleteFarmProfile(
  id: Types.ObjectId | string,
  farmerId: Types.ObjectId | string
): Promise<void> {
  const idObj = typeof id === 'string' ? new Types.ObjectId(id) : id;
  const farmerIdObj = typeof farmerId === 'string' ? new Types.ObjectId(farmerId) : farmerId;

  const existing = await FarmProfile.findOne({ _id: idObj, farmerId: farmerIdObj });
  if (!existing) {
    throw createError('Farm profile not found', 404, 'FARM_PROFILE_NOT_FOUND');
  }

  await FarmProfile.findByIdAndDelete(idObj);
}
