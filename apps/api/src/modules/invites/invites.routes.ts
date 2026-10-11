import { acceptInviteSchema, createInviteSchema } from '@spu-events/shared';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { invitesController } from './invites.controller';
import type { InvitesService } from './invites.service';

const idParams = z.object({ id: z.uuid('Invalid invite id') });
const tokenParams = z.object({ token: z.string().min(20).max(100) });

/** Mounted at /api/admin/invites. Admins only. */
export function adminInvitesRoutes(invites: InvitesService) {
  const c = invitesController(invites);
  const router = Router();

  router.use(requireRole('admin'));
  router.get('/', c.list);
  router.post('/', validate('body', createInviteSchema), c.create);
  router.post('/:id/revoke', validate('params', idParams), c.revoke);

  return router;
}

/** Mounted at /api/invites. Public: the token in the link is the credential. */
export function publicInvitesRoutes(invites: InvitesService, limiter: RequestHandler) {
  const c = invitesController(invites);
  const router = Router();

  router.get('/:token', validate('params', tokenParams), c.preview);
  router.post(
    '/:token/accept',
    limiter,
    validate('params', tokenParams),
    validate('body', acceptInviteSchema),
    c.accept,
  );

  return router;
}
