import cors from 'cors';
import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { Env } from './config/env';
import type { Db } from './db/client';
import type { Logger } from './lib/logger';
import { SESSION_COOKIE } from './lib/session';
import { UPLOADS_PUBLIC_PATH, type StorageService } from './lib/storage';
import { attachUser } from './middleware/auth';
import { errorHandler, notFound } from './middleware/error-handler';
import { authRateLimit } from './middleware/rate-limit';
import { requireSameOrigin } from './middleware/same-origin';
import { authRoutes } from './modules/auth/auth.routes';
import { authService } from './modules/auth/auth.service';
import { adminEventsRoutes, publicEventsRoutes } from './modules/events/events.routes';
import { eventsService } from './modules/events/events.service';
import { healthRoutes } from './modules/health/health.routes';
import { adminInvitesRoutes, publicInvitesRoutes } from './modules/invites/invites.routes';
import { invitesService } from './modules/invites/invites.service';
import { usersRepository } from './modules/users/users.repository';

export interface AppDeps {
  env: Pick<Env, 'NODE_ENV' | 'WEB_ORIGIN' | 'SESSION_SECRET'>;
  logger: Logger;
  db: Db;
  pingDb: () => Promise<boolean>;
  sessionStore: session.Store;
  storage: StorageService;
}

/** Builds the Express app without listening, so tests can drive it with supertest. */
export function createApp({ env, logger, db, pingDb, sessionStore, storage }: AppDeps) {
  const app = express();
  const users = usersRepository(db);
  const limiter = authRateLimit({ enabled: env.NODE_ENV !== 'test' });

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(pinoHttp({ logger }));
  // Uploaded images: public, cacheable, and served before sessions so they skip that work.
  if (storage.serve) app.use(UPLOADS_PUBLIC_PATH, storage.serve);
  app.use(
    session({
      name: SESSION_COOKIE,
      secret: env.SESSION_SECRET,
      store: sessionStore,
      resave: false,
      saveUninitialized: false,
      // Each request pushes expiry forward, so active users stay signed in.
      rolling: true,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    }),
  );
  app.use(requireSameOrigin(env.WEB_ORIGIN));
  app.use(attachUser(users));

  app.use('/api/health', healthRoutes(pingDb));
  app.use('/api/auth', authRoutes(authService({ users }), limiter));

  const invites = invitesService({ db, webOrigin: env.WEB_ORIGIN });
  app.use('/api/admin/invites', adminInvitesRoutes(invites));
  app.use('/api/invites', publicInvitesRoutes(invites, limiter));

  const events = eventsService({ db, storage });
  app.use('/api/events', publicEventsRoutes(events));
  app.use('/api/admin/events', adminEventsRoutes(events));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
