import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

interface AppError extends Error {
  statusCode?: number;
  code?: string;
  isOperational?: boolean;
}

export const errorHandler = (
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  if ((err as Error).name === 'CastError') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_ID',
        message: 'Invalid id format',
      },
    });
  }

  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const message = err.message || 'Internal Server Error';

  if (env.NODE_ENV === 'development') {
    console.error('❌ Error:', err);
  }

  if (!err.isOperational && env.NODE_ENV === 'production') {
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong',
      },
    });
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
    },
  });
};
