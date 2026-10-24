import { Router } from 'express';
import * as cropHealthController from './cropHealth.controller';
import { validate } from '../../middleware/validate';
import { requireAuth } from '../../middleware/requireAuth';
import { roleGuard } from '../../middleware/roleGuard';
import { uploadScanImage, handleUploadError } from '../../middleware/upload';
import {
  diagnoseSchema,
  scanIdParamsSchema,
  scanListQuerySchema,
} from './cropHealth.schema';

const router = Router();

router.use(requireAuth);

router.post(
  '/diagnose',
  roleGuard('farmer'),
  uploadScanImage.single('image'),
  handleUploadError,
  validate({ body: diagnoseSchema.shape.body }),
  cropHealthController.diagnoseCropHealthScan
);

router.get(
  '/scans',
  roleGuard('farmer'),
  validate({ query: scanListQuerySchema }),
  cropHealthController.listCropHealthScans
);

router.get(
  '/scans/:id',
  roleGuard('farmer'),
  validate({ params: scanIdParamsSchema }),
  cropHealthController.getCropHealthScan
);

router.patch(
  '/scans/:id/resolve',
  roleGuard('farmer'),
  validate({ params: scanIdParamsSchema }),
  cropHealthController.resolveCropHealthScan
);

export default router;
