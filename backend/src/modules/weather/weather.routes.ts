import { Router } from 'express';
import * as weatherController from './weather.controller';
import { validate } from '../../middleware/validate';
import { requireAuth } from '../../middleware/requireAuth';
import { weatherQuerySchema } from './weather.schema';

const router = Router();

router.use(requireAuth);

router.get(
  '/',
  validate({ query: weatherQuerySchema }),
  weatherController.getWeather
);

export default router;
