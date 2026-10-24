import { Router } from 'express';
import * as orderController from './order.controller';
import { validate } from '../../middleware/validate';
import {
  createOrderSchema,
  orderIdParamsSchema,
  orderQuerySchema,
  orderStatusSchema,
} from './order.schema';
import { requireAuth } from '../../middleware/requireAuth';

const router = Router();

router.use(requireAuth);

router.post(
  '/',
  validate({ body: createOrderSchema.shape.body }),
  orderController.createOrder
);

router.get('/', validate({ query: orderQuerySchema }), orderController.listOrders);

router.get(
  '/:id',
  validate({ params: orderIdParamsSchema }),
  orderController.getOrderById
);

router.patch(
  '/:id/status',
  validate({ params: orderIdParamsSchema, body: orderStatusSchema.shape.body }),
  orderController.changeOrderStatus
);

export default router;
