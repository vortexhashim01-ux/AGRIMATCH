import { Router } from 'express';
import * as marketPriceController from './marketPrice.controller';
import { validate } from '../../middleware/validate';
import { requireAuth } from '../../middleware/requireAuth';
import { marketPriceQuerySchema } from './marketPrice.schema';

const router = Router();

router.use(requireAuth);

router.get(
  '/',
  validate({ query: marketPriceQuerySchema }),
  marketPriceController.getMarketPrices
);

export default router;
