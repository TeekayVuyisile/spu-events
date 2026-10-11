import { rateLimit } from 'express-rate-limit';
import { AppError } from '../lib/errors';

/**
 * Slows password guessing on login, sign-up and invite acceptance: 10 attempts
 * per IP per 15 minutes. Disabled in tests. In-memory, so it's per API instance.
 */
export function authRateLimit({ enabled }: { enabled: boolean }) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: () => !enabled,
    handler: (_req, _res, next) =>
      next(
        new AppError(429, 'RATE_LIMITED', 'Too many attempts. Wait a few minutes and try again.'),
      ),
  });
}

/**
 * Per-user limit for posting (comments, photos), keyed by account rather than IP
 * so a whole residence on one NAT isn't throttled together. Use after requireAuth.
 */
export function userRateLimit({
  enabled,
  windowMs,
  limit,
}: {
  enabled: boolean;
  windowMs: number;
  limit: number;
}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: () => !enabled,
    keyGenerator: (_req, res) => res.locals.user!.id,
    handler: (_req, _res, next) =>
      next(
        new AppError(
          429,
          'RATE_LIMITED',
          'You’re posting a lot. Take a breather and try again soon.',
        ),
      ),
  });
}
