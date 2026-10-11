import {
  adminUserListQuerySchema,
  reinstateUserSchema,
  suspendUserSchema,
  walletAdjustmentSchema,
} from '@spu-events/shared';
import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { adminUsersController } from './admin-users.controller';
import type { AdminUsersService } from './admin-users.service';

const idParams = z.object({ id: z.uuid('Invalid user id') });

/** Mounted at /api/admin/users. Admins only. */
export function adminUsersRoutes(users: AdminUsersService) {
  const c = adminUsersController(users);
  const router = Router();
  const byId = validate('params', idParams);

  router.use(requireRole('admin'));
  router.get('/', validate('query', adminUserListQuerySchema), c.list);
  router.get('/:id', byId, c.get);
  router.post('/:id/suspend', byId, validate('body', suspendUserSchema), c.suspend);
  router.post('/:id/reinstate', byId, validate('body', reinstateUserSchema), c.reinstate);
  router.post(
    '/:id/wallet-adjustments',
    byId,
    validate('body', walletAdjustmentSchema),
    c.adjustWallet,
  );

  return router;
}
