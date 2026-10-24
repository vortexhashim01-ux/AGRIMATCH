import { Router } from 'express';
import * as farmProfileController from './farmProfile.controller';
import { validate } from '../../middleware/validate';
import { farmProfileSchema } from './farmProfile.schema';
import { requireAuth } from '../../middleware/requireAuth';
import { roleGuard } from '../../middleware/roleGuard';

const router = Router();

router.use(requireAuth);

router.post(
  '/',
  roleGuard('farmer'),
  validate({ body: farmProfileSchema.shape.body }),
  farmProfileController.createFarmProfile
);

router.get('/me', roleGuard('farmer'), farmProfileController.getMyFarmProfile);
router.get('/:id', farmProfileController.getFarmProfileById);

router.patch(
  '/:id',
  roleGuard('farmer'),
  validate({ body: farmProfileSchema.shape.body.partial() }),
  farmProfileController.updateFarmProfile
);

router.delete('/:id', roleGuard('farmer'), farmProfileController.deleteFarmProfile);

export default router;
