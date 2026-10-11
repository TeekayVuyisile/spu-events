import { loginSchema, signupSchema } from '@spu-events/shared';
import { Router, type RequestHandler } from 'express';
import { validate } from '../../middleware/validate';
import { authController } from './auth.controller';
import type { AuthService } from './auth.service';

export function authRoutes(auth: AuthService, limiter: RequestHandler) {
  const c = authController(auth);
  const router = Router();

  router.post('/signup', limiter, validate('body', signupSchema), c.signup);
  router.post('/login', limiter, validate('body', loginSchema), c.login);
  router.post('/logout', c.logout);
  router.get('/me', c.me);

  return router;
}
