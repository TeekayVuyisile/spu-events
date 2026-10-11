import { topUpSchema, withdrawSchema } from '@spu-events/shared';
import { Router } from 'express';
import { requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { walletController } from './wallet.controller';
import type { WalletService } from './wallet.service';

/** Mounted at /api/wallet. Only students have wallets. */
export function walletRoutes(wallet: WalletService) {
  const c = walletController(wallet);
  const router = Router();

  router.use(requireRole('student'));
  router.get('/', c.get);
  router.post('/top-ups', validate('body', topUpSchema), c.topUp);
  router.post('/withdrawals', validate('body', withdrawSchema), c.withdraw);

  return router;
}
