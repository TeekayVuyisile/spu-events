import { demoLoginSchema, type DemoInfo, type MeResponse } from '@spu-events/shared';
import { Router, type RequestHandler } from 'express';
import { AppError } from '../../lib/errors';
import { startSession } from '../../lib/session';
import { validate } from '../../middleware/validate';
import { demoEmailFor } from '../../seed/accounts';
import { toSessionUser, type UsersRepository } from '../users/users.repository';

export interface DemoConfig {
  /** Hours between automatic resets, or null if the data is never reset. */
  resetHours: number | null;
}

/**
 * One-click sign-in for public demos. The server signs the visitor in to the demo
 * account for the chosen role, so the shared password never reaches the browser.
 * Without `demo` config (any real deployment) the sign-in route doesn't exist.
 */
export function demoRoutes(
  users: UsersRepository,
  demo: DemoConfig | undefined,
  limiter: RequestHandler,
) {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json({ enabled: !!demo, resetHours: demo?.resetHours ?? null } satisfies DemoInfo);
  });

  if (!demo) return router;

  router.post('/login', limiter, validate('body', demoLoginSchema), async (req, res) => {
    const user = await users.findByEmail(demoEmailFor(res.locals.valid.body.role));
    // Missing only while the demo data is being reset.
    if (!user || user.status !== 'active') {
      throw new AppError(
        503,
        'DEMO_UNAVAILABLE',
        'The demo is being refreshed. Try again in a minute.',
      );
    }
    await startSession(req, user.id);
    res.json({ user: toSessionUser(user) } satisfies MeResponse);
  });

  return router;
}
