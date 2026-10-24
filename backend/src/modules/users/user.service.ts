import {
  DEFAULT_USER_PREFERENCES,
  IUser,
  IUserPreferences,
  User,
} from './user.model';
import { ListUsersQuery, UpdatePreferencesInput } from './user.schema';
import { Types } from 'mongoose';
import { CropListing } from '../crop-listing/cropListing.model';
import { BuyerRequirement } from '../buyer-requirements/buyerRequirement.model';
import { CropHealthScan } from '../crop-health/cropHealth.model';
import { CropPrediction } from '../crop-prediction/cropPrediction.model';
import { Match } from '../matching/matching.model';
import { Order } from '../orders/order.model';
import { Notification } from '../notifications/notification.model';
import { FarmProfile } from './farmProfile.model';
import { deleteScanImage } from '../../services/storage.service';

const ANONYMIZED_NAME = 'Deleted user';

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

/**
 * Documents created before `preferences` existed have no stored value for it,
 * so every read is reconciled against the defaults rather than trusting the
 * persisted shape.
 */
function withDefaults(
  prefs: Partial<IUserPreferences> | null | undefined
): IUserPreferences {
  return {
    themeMode: prefs?.themeMode ?? DEFAULT_USER_PREFERENCES.themeMode,
    accentColor: prefs?.accentColor ?? DEFAULT_USER_PREFERENCES.accentColor,
    largeText: prefs?.largeText ?? DEFAULT_USER_PREFERENCES.largeText,
  };
}

export async function updatePreferences(
  userId: string,
  input: UpdatePreferencesInput
): Promise<IUserPreferences> {
  const user = await User.findById(userId).select('preferences');
  if (!user) {
    throw createError('User not found', 404, 'USER_NOT_FOUND');
  }

  if (input.themeMode !== undefined) user.preferences.themeMode = input.themeMode;
  if (input.accentColor !== undefined) user.preferences.accentColor = input.accentColor;
  if (input.largeText !== undefined) user.preferences.largeText = input.largeText;

  await user.save();
  return withDefaults(user.preferences);
}

/**
 * Directory lookup used by a buyer browsing farmers (or vice-versa). Callers
 * see active accounts by default; the controller only lets an admin widen that
 * via `status`. Credential fields are excluded at the query level so they
 * cannot leak through the response.
 */
export async function listUsers(
  query: ListUsersQuery
): Promise<{ items: IUser[]; total: number; page: number; limit: number }> {
  const { role, search, status, page, limit } = query;

  const filter: Record<string, unknown> = {};
  if (status !== 'all') filter.isActive = status === 'active';
  if (role) filter.role = role;
  if (search) {
    // Escape user input so a stray regex metacharacter cannot break the query.
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.fullName = { $regex: escaped, $options: 'i' };
  }

  const [items, total] = await Promise.all([
    User.find(filter)
      .select('-passwordHash -refreshTokenHash')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    User.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

/**
 * Enables or disables an account. Disabling also clears the stored refresh
 * token, so an already-issued session cannot be renewed — without this the
 * account would stay usable for the remainder of its refresh window.
 */
export async function setUserActive(
  userId: string,
  isActive: boolean
): Promise<IUser> {
  const update: Record<string, unknown> = { isActive };
  if (!isActive) update.refreshTokenHash = null;

  const user = await User.findByIdAndUpdate(
    new Types.ObjectId(userId),
    { $set: update },
    { new: true }
  ).select('-passwordHash -refreshTokenHash');

  if (!user) {
    throw createError('User not found', 404, 'USER_NOT_FOUND');
  }

  return user;
}

/**
 * Everything the platform holds about a user, assembled for data portability
 * (PRD §12). Credential material is excluded at the query level, not filtered
 * afterwards, so an export can never contain a password or refresh-token hash.
 *
 * Orders and matches are included because the user is a party to them; those
 * documents reference the counterparty only by id, so the other side's private
 * profile and listings do not leak into this dump.
 */
export async function exportUserData(userId: string) {
  const id = new Types.ObjectId(userId);

  const [
    user,
    cropListings,
    buyerRequirements,
    cropHealthScans,
    cropPredictions,
    farmProfiles,
    orders,
    matches,
    notifications,
  ] = await Promise.all([
    User.findById(id).select('-passwordHash -refreshTokenHash').lean(),
    CropListing.find({ farmerId: id }).lean(),
    BuyerRequirement.find({ buyerId: id }).lean(),
    CropHealthScan.find({ farmerId: id }).lean(),
    CropPrediction.find({ userId: id }).lean(),
    FarmProfile.find({ farmerId: id }).lean(),
    Order.find({ $or: [{ farmerId: id }, { buyerId: id }] }).lean(),
    Match.find({ $or: [{ farmerId: id }, { buyerId: id }] }).lean(),
    Notification.find({ userId: id }).lean(),
  ]);

  if (!user) {
    throw createError('User not found', 404, 'USER_NOT_FOUND');
  }

  return {
    exportedAt: new Date().toISOString(),
    account: user,
    cropListings,
    buyerRequirements,
    cropHealthScans,
    cropPredictions,
    farmProfiles,
    orders,
    matches,
    notifications,
  };
}

/**
 * Account deletion (PRD §12). The account is **anonymised, not erased**: the
 * user's own private data and uploaded scan images go, but Orders and Matches
 * are retained so the counterparty's deal history does not silently vanish.
 *
 * Email and phone are cleared rather than replaced with a placeholder so the
 * unique sparse indexes are released and the address can be reused.
 */
export async function deleteMyAccount(userId: string): Promise<{
  scansRemoved: number;
  imagesRemoved: number;
}> {
  const id = new Types.ObjectId(userId);

  const user = await User.findById(id);
  // An account that was already deleted is treated as gone, so a repeat request
  // is a clean 404 rather than a second destructive pass.
  if (!user || user.deletedAt) {
    throw createError('User not found', 404, 'USER_NOT_FOUND');
  }

  // `imageProviderId` is the only thing that can locate the file on disk, so it
  // must be read before the scan documents are deleted.
  const scans = await CropHealthScan.find({ farmerId: id })
    .select('imageProviderId')
    .lean();

  let imagesRemoved = 0;
  for (const scan of scans) {
    if (scan.imageProviderId && (await deleteScanImage(scan.imageProviderId))) {
      imagesRemoved += 1;
    }
  }

  const [scanResult] = await Promise.all([
    CropHealthScan.deleteMany({ farmerId: id }),
    CropListing.deleteMany({ farmerId: id }),
    BuyerRequirement.deleteMany({ buyerId: id }),
    CropPrediction.deleteMany({ userId: id }),
    FarmProfile.deleteMany({ farmerId: id }),
    Notification.deleteMany({ userId: id }),
    // Orders and Matches are deliberately preserved — see the note above.
  ]);

  user.fullName = ANONYMIZED_NAME;
  user.email = undefined;
  user.phone = undefined;
  user.passwordHash = undefined;
  user.refreshTokenHash = null;
  user.isActive = false;
  user.isVerified = false;
  user.deletedAt = new Date();
  await user.save();

  return { scansRemoved: scanResult.deletedCount ?? 0, imagesRemoved };
}
