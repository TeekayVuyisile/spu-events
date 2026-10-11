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
