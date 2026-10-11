import { assignStaffSchema, scanInputSchema } from '@spu-events/shared';
import { Router } from 'express';
import { z } from 'zod';
import type { LiveBus } from '../../lib/live-bus';
import { requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { gateController } from './gate.controller';
import type { GateService } from './gate.service';

const idParams = z.object({ id: z.uuid('Invalid event id') });

/** Mounted at /api/gate. Gate staff and admins. */
export function gateRoutes(gate: GateService, bus: LiveBus) {
  const c = gateController(gate, bus);
  const router = Router();
  const byId = validate('params', idParams);

  router.use(requireRole('staff', 'admin'));
  router.get('/events', c.list);
  router.get('/events/:id', byId, c.overview);
  router.post('/events/:id/scan', byId, validate('body', scanInputSchema), c.scan);
  router.get('/events/:id/live', byId, c.live);

  return router;
}

/** Mounted at /api/admin. Choosing who works each event's gate. */
export function adminGateRoutes(gate: GateService, bus: LiveBus) {
  const c = gateController(gate, bus);
  const router = Router();
  const byId = validate('params', idParams);

  router.use(requireRole('admin'));
  router.get('/staff', c.listStaff);
  router.get('/events/:id/staff', byId, c.assignedStaff);
  router.put('/events/:id/staff', byId, validate('body', assignStaffSchema), c.assignStaff);

  return router;
}
