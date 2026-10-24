import { Router } from 'express';
import * as cropListingController from './cropListing.controller';
import { validate } from '../../middleware/validate';
import {
  cropListingQuerySchema,
  cropListingSchema,
  cropListingStatusSchema,
  cropListingUpdateSchema,
} from './cropListing.schema';
import { requireAuth } from '../../middleware/requireAuth';
import { roleGuard } from '../../middleware/roleGuard';

const router = Router();

router.use(requireAuth);

router.post(
  '/',
  roleGuard('farmer'),
  validate({ body: cropListingSchema.shape.body }),
  cropListingController.createCropListing
);

router.get(
  '/me',
  roleGuard('farmer'),
  validate({ query: cropListingQuerySchema }),
  cropListingController.listMyCropListings
);

router.get(
  '/',
  validate({ query: cropListingQuerySchema }),
  cropListingController.listMarketplace
);

router.post(
  '/:id/approve',
  roleGuard('farmer'),
  cropListingController.approveCropListing
);

router.post(
  '/:id/discard',
  roleGuard('farmer'),
  cropListingController.discardCropListing
);

router.patch(
  '/:id/status',
  roleGuard('farmer'),
  validate({ body: cropListingStatusSchema.shape.body }),
  cropListingController.changeCropListingStatus
);

router.get('/:id', cropListingController.getCropListingById);

router.patch(
  '/:id',
  roleGuard('farmer'),
  validate({ body: cropListingUpdateSchema.shape.body }),
  cropListingController.updateCropListing
);

router.delete(
  '/:id',
  roleGuard('farmer'),
  cropListingController.discardCropListing
);

export default router;
