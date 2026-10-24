import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

interface ValidationSchemas {
  body?: ZodSchema;
  params?: ZodSchema;
  query?: ZodSchema;
}

/**
 * Express 5 exposes `req.query` and `req.params` as prototype getters with no
 * setter, so a plain `req[key] = value` assignment throws. Defining an own data
 * property on the request shadows the getter, and staying writable lets the
 * router re-assign params on later layers.
 */
function setParsed(req: Request, key: 'body' | 'params' | 'query', value: unknown): void {
  Object.defineProperty(req, key, {
    value,
    writable: true,
    configurable: true,
    enumerable: true,
  });
}

export const validate = (schemas: ValidationSchemas) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schemas.body) {
        setParsed(req, 'body', schemas.body.parse(req.body));
      }
      if (schemas.params) {
        setParsed(req, 'params', schemas.params.parse(req.params));
      }
      if (schemas.query) {
        setParsed(req, 'query', schemas.query.parse(req.query));
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        }));

        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: errors,
          },
        });
      }
      next(error);
    }
  };
};
