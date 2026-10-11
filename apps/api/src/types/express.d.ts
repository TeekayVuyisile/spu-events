import type { SessionUser } from '@spu-events/shared';
import 'express-session';

declare module 'express-session' {
  interface SessionData {
    userId: string;
  }
}

declare global {
  namespace Express {
    interface Locals {
      /** Set by `attachUser` when the request carries a valid session for an active account. */
      user?: SessionUser;
    }
  }
}
