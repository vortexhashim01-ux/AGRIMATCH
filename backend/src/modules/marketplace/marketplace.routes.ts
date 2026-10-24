import { Router } from 'express';
import * as marketplaceController from './marketplace.controller';
import { validate } from '../../middleware/validate';
import { marketplaceQuerySchema } from './marketplace.schema';

const router = Router();

router.get(
  '/',
  validate({ query: marketplaceQuerySchema }),
  marketplaceController.browseMarketplace
);

export default router;
