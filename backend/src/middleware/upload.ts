import { Request, Response, NextFunction } from 'express';
import multer from 'multer';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

interface UploadError extends Error {
  statusCode?: number;
  code?: string;
  isOperational?: boolean;
}

function createError(
  message: string,
  statusCode: number,
  code: string
): UploadError {
  const err = new Error(message) as UploadError;
  err.statusCode = statusCode;
  err.code = code;
  err.isOperational = true;
  return err;
}

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const fileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return cb(createError('Only JPEG, PNG or WebP images are allowed', 400, 'INVALID_FILE_TYPE'));
  }
  cb(null, true);
};

export const uploadScanImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
  fileFilter,
});

/**
 * Express error middleware to be mounted immediately after the multer handler.
 * Multer reports its own errors as `MulterError`, which we translate into the
 * project's response shape; everything else is passed through unchanged.
 */
export function handleUploadError(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction
) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        error: {
          code: 'FILE_TOO_LARGE',
          message: 'Image must be 5 MB or smaller',
        },
      });
    }

    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_FILE',
        message: err.message,
      },
    });
  }

  next(err);
}
