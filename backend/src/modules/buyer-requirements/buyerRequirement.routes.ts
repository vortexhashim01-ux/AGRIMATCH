import { Router } from 'express';
import * as buyerRequirementController from './buyerRequirement.controller';
import { validate } from '../../middleware/validate';
import {
  buyerRequirementQuerySchema,
  buyerRequirementSchema,
  buyerRequirementStatusSchema,
  buyerRequirementUpdateSchema,
} from './buyerRequirement.schema';
import { requireAuth } from '../../middleware/requireAuth';
import { roleGuard } from '../../middleware/roleGuard';

const router = Router();

router.use(requireAuth);

router.post(
  '/',
  roleGuard('buyer'),
  validate({ body: buyerRequirementSchema.shape.body }),
  buyerRequirementController.createBuyerRequirement
);

router.get(
  '/me',
  roleGuard('buyer'),
  validate({ query: buyerRequirementQuerySchema }),
  buyerRequirementController.listMyBuyerRequirements
);

router.get(
  '/',
  validate({ query: buyerRequirementQuerySchema }),
  buyerRequirementController.listMarketplace
);

router.post(
  '/:id/approve',
  roleGuard('buyer'),
  buyerRequirementController.approveBuyerRequirement
);

router.post(
  '/:id/discard',
  roleGuard('buyer'),
  buyerRequirementController.discardBuyerRequirement
);

router.patch(
  '/:id/status',
  roleGuard('buyer'),
  validate({ body: buyerRequirementStatusSchema.shape.body }),
  buyerRequirementController.changeBuyerRequirementStatus
);

router.get('/:id', buyerRequirementController.getBuyerRequirementById);

router.patch(
  '/:id',
  roleGuard('buyer'),
  validate({ body: buyerRequirementUpdateSchema.shape.body }),
  buyerRequirementController.updateBuyerRequirement
);

router.delete(
  '/:id',
  roleGuard('buyer'),
  buyerRequirementController.discardBuyerRequirement
);

export default router;
