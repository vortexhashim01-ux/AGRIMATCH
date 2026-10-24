import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { Response } from 'express';
import { env } from '../config/env';
import { UserRole } from '../modules/users/user.model';

export interface TokenPayload {
  userId: string;
  role: UserRole;
}

export function generateAccessToken(userId: Types.ObjectId, role: UserRole): string {
  const payload: TokenPayload = {
    userId: userId.toString(),
    role,
  };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
  } as jwt.SignOptions);
}

export function generateRefreshToken(userId: Types.ObjectId, role: UserRole): string {
  const payload: TokenPayload = {
    userId: userId.toString(),
    role,
  };
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as TokenPayload;
}

export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as TokenPayload;
}

export function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string
) {
  const accessTokenExpiryMs = 15 * 60 * 1000;
  const refreshTokenExpiryMs = 7 * 24 * 60 * 60 * 1000;

  res.cookie('accessToken', accessToken, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: accessTokenExpiryMs,
    path: '/',
  });

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: refreshTokenExpiryMs,
    path: '/api/v1/auth',
  });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie('accessToken', {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/',
  });

  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/api/v1/auth',
  });
}
