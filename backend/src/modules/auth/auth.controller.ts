import { Request, Response, NextFunction } from 'express';
import * as authService from './auth.service';
import { setAuthCookies, clearAuthCookies } from '../../utils/jwt';
import { RegisterInput, LoginWithPasswordInput, RequestOTPInput, VerifyOTPInput, ForgotPasswordInput, ResetPasswordInput } from './auth.schema';
import { UserRole } from '../users/user.model';

interface AuthenticatedRequest extends Request {
  userId?: string;
  userRole?: UserRole;
}

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.register(req.body as RegisterInput);
    setAuthCookies(res, result.accessToken, result.refreshToken);
    res.status(201).json({
      success: true,
      data: {
        user: result.user,
        accessToken: result.accessToken,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function loginWithPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.loginWithPassword(req.body as LoginWithPasswordInput);
    setAuthCookies(res, result.accessToken, result.refreshToken);
    res.status(200).json({
      success: true,
      data: {
        user: result.user,
        accessToken: result.accessToken,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function requestOTP(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.requestOTP(req.body as RequestOTPInput);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function verifyOTP(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.verifyOTPLogin(req.body as VerifyOTPInput);
    setAuthCookies(res, result.accessToken, result.refreshToken);
    res.status(200).json({
      success: true,
      data: {
        user: result.user,
        accessToken: result.accessToken,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function forgotPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.forgotPassword(req.body as ForgotPasswordInput);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function resetPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.resetPassword(req.body as ResetPasswordInput);
    res.status(200).json({
      success: true,
      message: 'Password reset successfully. Please log in with your new password.',
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function demoLogin(req: Request, res: Response, next: NextFunction) {
  try {
    const { identifier, password } = req.body ?? {};
    if (password !== '123456' || typeof identifier !== 'string' || !identifier.trim()) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Use password 123456 and enter an email or phone number' } });
    const identity = identifier.includes('@') ? { email: identifier.trim().toLowerCase() } : { phone: identifier.trim() };
    const result = await authService.demoLogin(identity);
    setAuthCookies(res, result.accessToken, result.refreshToken);
    res.status(200).json({ success: true, data: { user: result.user, accessToken: result.accessToken } });
  } catch (error) { next(error); }
}
export async function selectRole(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.userId || !['farmer', 'buyer'].includes(req.body?.role)) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Choose farmer or buyer' } });
    const result = await authService.selectRole(req.userId, req.body.role);
    setAuthCookies(res, result.accessToken, result.refreshToken);
    res.status(200).json({ success: true, data: { user: result.user, accessToken: result.accessToken } });
  } catch (error) { next(error); }
}
export async function refreshToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Refresh token is required',
        },
      });
    }
    const result = await authService.refreshTokenService(refreshToken);
    setAuthCookies(res, result.accessToken, result.refreshToken);
    res.status(200).json({
      success: true,
      data: {
        user: result.user,
        accessToken: result.accessToken,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function logout(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (req.userId) {
      await authService.logout(req.userId);
    } else if (typeof req.cookies?.refreshToken === 'string') {
      // The access token may already be expired; fall back to the refresh cookie
      // so logging out still invalidates the session server-side.
      await authService.logoutByRefreshToken(req.cookies.refreshToken);
    }
    clearAuthCookies(res);
    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    next(error);
  }
}

export async function getMe(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
    }
    const user = await authService.getCurrentUser(req.userId);
    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
}
