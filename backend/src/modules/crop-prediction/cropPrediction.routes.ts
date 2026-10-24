import { Router } from 'express';
import * as cropPredictionController from './cropPrediction.controller';
import { validate } from '../../middleware/validate';
import {
  generatePredictionSchema,
  predictionQuerySchema,
  objectIdParamsSchema,
} from './cropPrediction.schema';
import { requireAuth } from '../../middleware/requireAuth';

const router = Router();

router.use(requireAuth);

router.post(
  '/generate',
  validate({ body: generatePredictionSchema.shape.body }),
  cropPredictionController.generatePrediction
);

router.get(
  '/me',
  validate({ query: predictionQuerySchema }),
  cropPredictionController.listMyPredictions
);

router.get(
  '/:id',
  validate({ params: objectIdParamsSchema }),
  cropPredictionController.getPredictionById
);

router.delete(
  '/:id',
  validate({ params: objectIdParamsSchema }),
  cropPredictionController.softDeletePrediction
);

export default router;
