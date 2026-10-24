import { Router } from 'express';
import * as dashboardController from './dashboard.controller';
import { requireAuth } from '../../middleware/requireAuth';

const router = Router();

router.use(requireAuth);

// Role-aware: the response shape follows the caller's own role, so there is a
// single endpoint rather than one per role.
router.get('/summary', dashboardController.getSummary);

export default router;
