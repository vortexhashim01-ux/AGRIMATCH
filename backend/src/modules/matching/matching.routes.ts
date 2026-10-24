import { Router } from 'express';
import * as matchingController from './matching.controller';
import { validate } from '../../middleware/validate';
import {
  runForListingSchema,
  runForRequirementSchema,
  matchIdParamsSchema,
  matchingQuerySchema,
  rejectMatchSchema,
} from './matching.schema';
import { requireAuth } from '../../middleware/requireAuth';
import { roleGuard } from '../../middleware/roleGuard';

const router = Router();

router.use(requireAuth);

router.post(
  '/listings/:listingId/run',
  roleGuard('farmer'),
  validate({
    body: runForListingSchema.shape.body,
    params: runForListingSchema.shape.params,
  }),
  matchingController.runMatchingForListing
);

router.post(
  '/requirements/:requirementId/run',
  roleGuard('buyer'),
  validate({
    body: runForRequirementSchema.shape.body,
    params: runForRequirementSchema.shape.params,
  }),
  matchingController.runMatchingForRequirement
);

router.get(
  '/me',
  validate({ query: matchingQuerySchema }),
  matchingController.listMyMatches
);

router.get(
  '/:id',
  validate({ params: matchIdParamsSchema }),
  matchingController.getMatchById
);

router.post(
  '/:id/accept',
  validate({ params: matchIdParamsSchema }),
  matchingController.acceptMatch
);

router.post(
  '/:id/reject',
  validate({ params: matchIdParamsSchema, body: rejectMatchSchema.shape.body }),
  matchingController.rejectMatch
);

export default router;
