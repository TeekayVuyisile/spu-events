import { dashboardQuerySchema } from '@spu-events/shared';
import { Router } from 'express';
import { requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import type { DashboardService } from './dashboard.service';

/** Mounted at /api/admin/dashboard. Admins only. */
export function dashboardRoutes(dashboard: DashboardService) {
  const router = Router();
  router.use(requireRole('admin'));
  router.get('/', validate('query', dashboardQuerySchema), async (_req, res) => {
    res.json({ dashboard: await dashboard.get(res.locals.valid.query.range) });
  });
  return router;
}
