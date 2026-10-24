import { z } from 'zod';

const ObjectIdRegex = /^[0-9a-fA-F]{24}$/;
const objectIdParam = z.string().regex(ObjectIdRegex, 'Invalid id');

const orderStatusValues = [
  'pending',
  'confirmed',
  'shipped',
  'delivered',
  'cancelled',
] as const;

export const orderIdParamsSchema = z.object({
  id: objectIdParam,
});

export const createOrderSchema = z.object({
  body: z.object({
    matchId: objectIdParam,
    quantityKg: z.number().positive(),
    agreedPricePerKg: z.number().min(0),
    deliveryDate: z.coerce.date(),
  }),
});

export const orderStatusSchema = z.object({
  body: z.object({
    status: z.enum(['confirmed', 'shipped', 'delivered', 'cancelled']),
  }),
});

export const orderQuerySchema = z.object({
  status: z.enum(orderStatusValues).optional(),
  role: z.enum(['farmer', 'buyer']).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>['body'];
export type OrderStatusInput = z.infer<typeof orderStatusSchema>['body'];
export type OrderQuery = z.infer<typeof orderQuerySchema>;
