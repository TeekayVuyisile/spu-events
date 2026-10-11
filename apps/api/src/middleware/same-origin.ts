import type { RequestHandler } from 'express';
import { AppError } from '../lib/errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence for cookie sessions: a state-changing request must come from the
 * web app's own origin. Browsers always send `Origin` on cross-site POSTs and
 * scripts can't forge it. SameSite=Lax cookies are the second layer.
 */
export function requireSameOrigin(allowedOrigin: string): RequestHandler {
  const allowed = new URL(allowedOrigin).origin;

  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();

    const source = req.get('origin') ?? req.get('referer');
    let origin: string | undefined;
    try {
      origin = source ? new URL(source).origin : undefined;
    } catch {
      origin = undefined;
    }

    if (origin === allowed) return next();
    next(new AppError(403, 'BAD_ORIGIN', 'Request blocked: it did not come from the Monthati app'));
  };
}
