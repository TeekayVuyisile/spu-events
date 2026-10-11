import type { MeResponse } from '@spu-events/shared';
import type { RequestHandler } from 'express';
import { endSession, startSession } from '../../lib/session';
import type { AuthService } from './auth.service';

export function authController(auth: AuthService) {
  const signup: RequestHandler = async (req, res) => {
    const user = await auth.signup(res.locals.valid.body);
    await startSession(req, user.id);
    res.status(201).json({ user } satisfies MeResponse);
  };

  const login: RequestHandler = async (req, res) => {
    const user = await auth.login(res.locals.valid.body);
    await startSession(req, user.id);
    res.json({ user } satisfies MeResponse);
  };

  const logout: RequestHandler = async (req, res) => {
    await endSession(req, res);
    res.status(204).end();
  };

  /** Always 200: `user` is null when signed out, which keeps the web app's session query simple. */
  const me: RequestHandler = (_req, res) => {
    res.json({ user: res.locals.user ?? null } satisfies MeResponse);
  };

  return { signup, login, logout, me };
}
