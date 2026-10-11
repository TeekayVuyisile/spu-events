import type { Role } from '@spu-events/shared';
import type { RequestHandler } from 'express';
import { AppError } from '../lib/errors';
import { toSessionUser, type UsersRepository } from '../modules/users/users.repository';

/**
 * Loads the signed-in user on every request, so a suspension or role change
 * takes effect immediately instead of when the session expires.
 */
export function attachUser(users: UsersRepository): RequestHandler {
  return async (req, res, next) => {
    const userId = req.session?.userId;
    if (!userId) return next();

    const user = await users.findById(userId);
    if (user?.status === 'active') {
      res.locals.user = toSessionUser(user);
    } else {
      delete req.session.userId;
    }
    next();
  };
}

export const requireAuth: RequestHandler = (_req, res, next) => {
  next(res.locals.user ? undefined : AppError.unauthorized());
};

/** 401 when signed out, 403 when signed in with a role that isn't listed. */
export function requireRole(...roles: Role[]): RequestHandler {
  return (_req, res, next) => {
    const { user } = res.locals;
    if (!user) return next(AppError.unauthorized());
    next(roles.includes(user.role) ? undefined : AppError.forbidden());
  };
}
