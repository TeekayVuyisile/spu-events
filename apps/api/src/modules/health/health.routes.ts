import type { Health } from '@spu-events/shared';
import { Router } from 'express';

export function healthRoutes(pingDb: () => Promise<boolean>) {
  const router = Router();

  router.get('/', async (_req, res) => {
    const dbUp = await pingDb().catch(() => false);
    const body: Health = { status: 'ok', db: dbUp ? 'up' : 'down', time: new Date().toISOString() };
    res.status(dbUp ? 200 : 503).json(body);
  });

  return router;
}
