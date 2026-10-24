import bcrypt from 'bcryptjs';
import { User, IUser } from '../users/user.model';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../../utils/jwt';
import { generateOTP, storeOTP, verifyOTP, sendOTP, isRateLimited } from '../../services/otp.service';
import {
  RegisterInput,
  LoginWithPasswordInput,
  RequestOTPInput,
  VerifyOTPInput,
  ForgotPasswordInput,
  ResetPasswordInput,
} from './auth.schema';

type UserDocument = any;
type UserFilter = any;

interface AuthResult {
  user: Omit<IUser, 'passwordHash' | 'refreshTokenHash'>;
  accessToken: string;
  refreshToken: string;
}

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

function sanitizeUser(user: UserDocument): Omit<IUser, 'passwordHash' | 'refreshTokenHash'> {
  const userObj = typeof user.toObject === 'function' ? user.toObject() : { ...user };
  delete userObj.passwordHash;
  delete userObj.refreshTokenHash;
  delete userObj.__v;
  return userObj;
}

function buildEmailPhoneFilter(input: { email?: string; phone?: string }): UserFilter {
  const conditions: UserFilter[] = [];
  if (input.email) {
    conditions.push({ email: input.email });
  }
  if (input.phone) {
    conditions.push({ phone: input.phone });
  }
  return conditions.length > 0 ? { $or: conditions } : {};
}

async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12;
  return bcrypt.hash(password, saltRounds);
}

async function hashRefreshToken(token: string): Promise<string> {
  return bcrypt.hash(token, 10);
}

export async function register(input: RegisterInput): Promise<AuthResult> {
  const filter = buildEmailPhoneFilter({ email: input.email, phone: input.phone });
  const existingUser = await User.findOne(filter);

  if (existingUser) {
    throw createError('User with this email or phone already exists', 409, 'USER_EXISTS');
  }

  let passwordHash: string | undefined;
  if (input.password) {
    passwordHash = await hashPassword(input.password);
  }

  const user = await User.create({
    fullName: input.fullName,
    email: input.email || undefined,
    phone: input.phone || undefined,
    passwordHash,
    role: input.role,
    language: input.language,
    isVerified: false,
    isActive: true,
    lastLoginAt: new Date(),
  });

  const accessToken = generateAccessToken(user._id, user.role);
  const refreshToken = generateRefreshToken(user._id, user.role);
  user.refreshTokenHash = await hashRefreshToken(refreshToken);
  await user.save();

  return {
    user: sanitizeUser(user),
    accessToken,
    refreshToken,
  };
}

export async function loginWithPassword(input: LoginWithPasswordInput): Promise<AuthResult> {
  const filter = buildEmailPhoneFilter({ email: input.email, phone: input.phone });
  const user = await User.findOne(filter).select('+passwordHash +refreshTokenHash');

  if (!user) {
    throw createError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
  }

  if (!user.isActive) {
    throw createError('Account is disabled', 403, 'ACCOUNT_DISABLED');
  }

  if (!user.passwordHash || !(await bcrypt.compare(input.password, user.passwordHash))) {
    throw createError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
  }

  const accessToken = generateAccessToken(user._id, user.role);
  const refreshToken = generateRefreshToken(user._id, user.role);
  user.refreshTokenHash = await hashRefreshToken(refreshToken);
  user.lastLoginAt = new Date();
  await user.save();

  return {
    user: sanitizeUser(user),
    accessToken,
    refreshToken,
  };
}

export async function demoLogin(input: { email?: string; phone?: string }): Promise<AuthResult> {
  const filter = buildEmailPhoneFilter(input);
  let user = await User.findOne(filter).select('+refreshTokenHash');
  if (!user) {
    const fullName = input.email ? input.email.split('@')[0] : input.phone!;
    user = await User.create({ fullName, email: input.email, phone: input.phone, role: 'farmer', language: 'en', isActive: true, isVerified: true, lastLoginAt: new Date() });
  }
  if (!user.isActive) throw createError('Account is disabled', 403, 'ACCOUNT_DISABLED');
  const accessToken = generateAccessToken(user._id, user.role);
  const refreshToken = generateRefreshToken(user._id, user.role);
  user.refreshTokenHash = await hashRefreshToken(refreshToken);
  user.lastLoginAt = new Date();
  await user.save();
  return { user: sanitizeUser(user), accessToken, refreshToken };
}
export async function selectRole(userId: string, role: 'farmer' | 'buyer'): Promise<AuthResult> {
  const user = await User.findByIdAndUpdate(userId, { role }, { new: true }).select('+refreshTokenHash');
  if (!user || !user.isActive) throw createError('Invalid or inactive account', 401, 'INVALID_ACCOUNT');
  const accessToken = generateAccessToken(user._id, user.role);
  const refreshToken = generateRefreshToken(user._id, user.role);
  user.refreshTokenHash = await hashRefreshToken(refreshToken);
  await user.save();
  return { user: sanitizeUser(user), accessToken, refreshToken };
}
export async function requestOTP(input: RequestOTPInput): Promise<{ sent: boolean; expiresIn: number }> {
  const identifier = input.phone!;
  const method: 'sms' = 'sms';

  if (await isRateLimited(identifier)) {
    throw createError('Too many OTP requests. Please try again later.', 429, 'RATE_LIMITED');
  }

  const otp = generateOTP();

  try {
    await storeOTP(identifier, otp);
    await sendOTP(identifier, method, otp);
  } catch (e) {
    console.error('[OTP] Failed to send OTP:', e);
    throw createError('Failed to send verification code', 500, 'OTP_SEND_FAILED');
  }

  return {
    sent: true,
    expiresIn: 10 * 60,
  };
}

export async function verifyOTPLogin(input: VerifyOTPInput): Promise<AuthResult> {
  const identifier = input.phone!;
  const result = await verifyOTP(identifier, input.otp);

  if (result === 'expired') {
    throw createError('OTP has expired. Please request a new one.', 400, 'OTP_EXPIRED');
  }

  if (result === 'attempts_exceeded') {
    throw createError('Too many invalid attempts. Please request a new OTP.', 429, 'OTP_ATTEMPTS_EXCEEDED');
  }

  if (result !== 'success') {
    throw createError('Invalid OTP code', 400, 'INVALID_OTP');
  }

  const user = await User.findOne({ phone: input.phone });

  if (!user) {
    throw createError('No account found with this identifier. Please register first.', 404, 'USER_NOT_FOUND');
  }

  if (!user.isActive) {
    throw createError('Account is disabled', 403, 'ACCOUNT_DISABLED');
  }

  user.isVerified = true;
  user.lastLoginAt = new Date();

  const accessToken = generateAccessToken(user._id, user.role);
  const refreshToken = generateRefreshToken(user._id, user.role);
  user.refreshTokenHash = await hashRefreshToken(refreshToken);
  await user.save();

  return {
    user: sanitizeUser(user),
    accessToken,
    refreshToken,
  };
}

/**
 * Starts a password reset by sending an OTP to the account's phone number.
 * Always reports success so the endpoint cannot be used to enumerate accounts.
 */
export async function forgotPassword(
  input: ForgotPasswordInput
): Promise<{ sent: boolean; expiresIn: number }> {
  const identifier = input.phone;

  if (await isRateLimited(identifier)) {
    throw createError('Too many OTP requests. Please try again later.', 429, 'RATE_LIMITED');
  }

  const user = await User.findOne({ phone: identifier });
  if (!user) {
    return { sent: true, expiresIn: 10 * 60 };
  }

  const otp = generateOTP();

  try {
    await storeOTP(identifier, otp);
    await sendOTP(identifier, 'sms', otp);
  } catch (e) {
    console.error('[OTP] Failed to send password reset OTP:', e);
    throw createError('Failed to send verification code', 500, 'OTP_SEND_FAILED');
  }

  return { sent: true, expiresIn: 10 * 60 };
}

/**
 * Consumes the reset OTP and sets a new password. Existing sessions are revoked
 * by clearing `refreshTokenHash`, so the old refresh cookie stops working.
 */
export async function resetPassword(
  input: ResetPasswordInput
): Promise<{ user: Omit<IUser, 'passwordHash' | 'refreshTokenHash'> }> {
  const identifier = input.phone;
  const result = await verifyOTP(identifier, input.otp);

  if (result === 'expired') {
    throw createError('OTP has expired. Please request a new one.', 400, 'OTP_EXPIRED');
  }

  if (result === 'attempts_exceeded') {
    throw createError('Too many invalid attempts. Please request a new OTP.', 429, 'OTP_ATTEMPTS_EXCEEDED');
  }

  if (result !== 'success') {
    throw createError('Invalid OTP code', 400, 'INVALID_OTP');
  }

  const user = await User.findOne({ phone: identifier }).select('+passwordHash');
  if (!user) {
    throw createError('No account found with this phone number.', 404, 'USER_NOT_FOUND');
  }

  if (!user.isActive) {
    throw createError('Account is disabled', 403, 'ACCOUNT_DISABLED');
  }

  user.passwordHash = await hashPassword(input.newPassword);
  user.refreshTokenHash = null;
  await user.save();

  return { user: sanitizeUser(user) };
}

export async function refreshTokenService(refreshToken: string): Promise<AuthResult> {
  const payload = verifyRefreshToken(refreshToken);

  const user = await User.findById(payload.userId).select('+refreshTokenHash');
  if (!user || !user.isActive) {
    throw createError('Invalid or inactive account', 401, 'INVALID_REFRESH_TOKEN');
  }

  if (!user.refreshTokenHash) {
    throw createError('Refresh token has been revoked', 401, 'REFRESH_REVOKED');
  }

  const isValid = await bcrypt.compare(refreshToken, user.refreshTokenHash);
  if (!isValid) {
    throw createError('Invalid refresh token', 401, 'INVALID_REFRESH_TOKEN');
  }

  const accessToken = generateAccessToken(user._id, user.role);
  const newRefreshToken = generateRefreshToken(user._id, user.role);
  user.refreshTokenHash = await hashRefreshToken(newRefreshToken);
  await user.save();

  return {
    user: sanitizeUser(user),
    accessToken,
    refreshToken: newRefreshToken,
  };
}

export async function logout(userId: string) {
  await User.findByIdAndUpdate(userId, { refreshTokenHash: null });
}

/**
 * Revokes the session using the refresh cookie instead of an access token.
 * Needed because `/logout` is reachable with an already-expired access token.
 */
export async function logoutByRefreshToken(refreshToken: string) {
  try {
    const payload = verifyRefreshToken(refreshToken);
    const user = await User.findById(payload.userId).select('+refreshTokenHash');
    if (user?.refreshTokenHash && (await bcrypt.compare(refreshToken, user.refreshTokenHash))) {
      user.refreshTokenHash = null;
      await user.save();
    }
  } catch {
    // Expired or tampered token — there is nothing left to revoke.
  }
}

export async function getCurrentUser(userId: string) {
  const user = await User.findById(userId);
  if (!user) {
    throw createError('User not found', 404, 'USER_NOT_FOUND');
  }
  return sanitizeUser(user);
}
