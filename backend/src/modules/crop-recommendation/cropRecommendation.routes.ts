import { Router } from 'express';
import * as cropRecommendationController from './cropRecommendation.controller';
import { validate } from '../../middleware/validate';
import {
  cropRecommendationIdParamsSchema,
  cropRecommendationQuerySchema,
  generateCropRecommendationSchema,
} from './cropRecommendation.schema';
import { requireAuth } from '../../middleware/requireAuth';
import { roleGuard } from '../../middleware/roleGuard';

const router = Router();

router.use(requireAuth);

router.post(
  '/generate',
  roleGuard('farmer'),
  validate({ body: generateCropRecommendationSchema.shape.body }),
  cropRecommendationController.generateCropRecommendation
);

router.get(
  '/me',
  roleGuard('farmer'),
  validate({ query: cropRecommendationQuerySchema }),
  cropRecommendationController.listMyCropRecommendations
);

router.get(
  '/:id',
  validate({ params: cropRecommendationIdParamsSchema }),
  cropRecommendationController.getCropRecommendationById
);

export default router;
