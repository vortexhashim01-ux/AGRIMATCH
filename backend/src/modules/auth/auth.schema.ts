import { z } from 'zod';
import { UserRole, Language } from '../users/user.model';

export const registerSchema = z.object({
  body: z.object({
    fullName: z.string().min(2).max(100).trim(),
    email: z.string().email().optional().or(z.literal('')),
    phone: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone format (E.164)').optional(),
    password: z.string().min(8).max(128).optional(),
    role: z.enum(['farmer', 'buyer'] as const satisfies readonly UserRole[]),
    language: z.enum(['en', 'hi', 'ta', 'bn'] as const satisfies readonly Language[]).default('en'),
  }).refine(
    (data) => data.email || data.phone,
    { message: 'Either email or phone is required', path: ['email', 'phone'] }
  ).refine(
    (data) => !data.password || data.password.length >= 8,
    { message: 'Password must be at least 8 characters', path: ['password'] }
  ),
});

export const loginWithPasswordSchema = z.object({
  body: z.object({
    email: z.string().email().optional(),
    phone: z.string().regex(/^\+?[1-9]\d{1,14}$/).optional(),
    password: z.string().min(1, 'Password is required'),
  }).refine(
    (data) => data.email || data.phone,
    { message: 'Either email or phone is required', path: ['email', 'phone'] }
  ),
});

export const requestOTPSchema = z.object({
  body: z.object({
    email: z.string().email().optional(),
    phone: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone format (E.164)'),
  }),
});

export const verifyOTPSchema = z.object({
  body: z.object({
    email: z.string().email().optional(),
    phone: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone format (E.164)'),
    otp: z.string().length(6, 'OTP must be 6 digits'),
    purpose: z.enum(['login', 'verify', 'reset_password']).default('verify'),
  }),
});

export const refreshTokenSchema = z.object({
  cookies: z.object({
    refreshToken: z.string().min(1, 'Refresh token is required'),
  }),
});

// Password reset is phone-based because email OTP delivery is disabled.
export const forgotPasswordSchema = z.object({
  body: z.object({
    phone: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone format (E.164)'),
  }),
});

export const resetPasswordSchema = z.object({
  body: z.object({
    phone: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone format (E.164)'),
    otp: z.string().length(6, 'OTP must be 6 digits'),
    newPassword: z.string().min(8, 'Password must be at least 8 characters').max(128),
  }),
});

export type RegisterInput = z.infer<typeof registerSchema>['body'];
export type LoginWithPasswordInput = z.infer<typeof loginWithPasswordSchema>['body'];
export type RequestOTPInput = z.infer<typeof requestOTPSchema>['body'];
export type VerifyOTPInput = z.infer<typeof verifyOTPSchema>['body'];
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>['body'];
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>['body'];
