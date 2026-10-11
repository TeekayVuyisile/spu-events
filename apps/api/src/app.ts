import cors from 'cors';
import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { Env } from './config/env';
import type { Db } from './db/client';
import type { Geocoder } from './lib/geocoder';
import type { LiveBus } from './lib/live-bus';
import type { Logger } from './lib/logger';
import type { PaymentProvider } from './lib/payments';
import { SESSION_COOKIE } from './lib/session';
import { UPLOADS_PUBLIC_PATH, type StorageService } from './lib/storage';
import { ticketSigner } from './lib/ticket-signing';
import { webApp } from './lib/web-app';
import { attachUser } from './middleware/auth';
import { errorHandler, notFound } from './middleware/error-handler';
import { authRateLimit } from './middleware/rate-limit';
import { requireSameOrigin } from './middleware/same-origin';
import { adminUsersRoutes } from './modules/admin-users/admin-users.routes';
import { adminUsersService } from './modules/admin-users/admin-users.service';
import { adminAttendeesRoutes } from './modules/attendees/attendees.routes';
import { attendeesService } from './modules/attendees/attendees.service';
import { authRoutes } from './modules/auth/auth.routes';
import { authService } from './modules/auth/auth.service';
import { adminEventsRoutes, publicEventsRoutes } from './modules/events/events.routes';
import { dashboardRoutes } from './modules/dashboard/dashboard.routes';
import { dashboardService } from './modules/dashboard/dashboard.service';
import { eventsService } from './modules/events/events.service';
import { adminGateRoutes, gateRoutes } from './modules/gate/gate.routes';
import { gateService } from './modules/gate/gate.service';
import { healthRoutes } from './modules/health/health.routes';
import { adminInvitesRoutes, publicInvitesRoutes } from './modules/invites/invites.routes';
import { invitesService } from './modules/invites/invites.service';
import { adminCommunityRoutes, communityRoutes } from './modules/community/community.routes';
import { communityService } from './modules/community/community.service';
import { notificationsRoutes } from './modules/notifications/notifications.routes';
import { notificationsService } from './modules/notifications/notifications.service';
import { placesRoutes } from './modules/places/places.routes';
import { socialRoutes } from './modules/social/social.routes';
import { socialService } from './modules/social/social.service';
import { purchaseRoute, ticketsRoutes } from './modules/tickets/tickets.routes';
import { ticketsService } from './modules/tickets/tickets.service';
import { usersRepository } from './modules/users/users.repository';
import { walletRoutes } from './modules/wallet/wallet.routes';
import { walletService } from './modules/wallet/wallet.service';

export interface AppDeps {
  env: Pick<Env, 'NODE_ENV' | 'WEB_ORIGIN' | 'SESSION_SECRET' | 'TICKET_SIGNING_SECRET'>;
  logger: Logger;
  db: Db;
  pingDb: () => Promise<boolean>;
  sessionStore: session.Store;
  storage: StorageService;
  payments: PaymentProvider;
  bus: LiveBus;
  geocoder: Geocoder;
  /** Built web app to serve on the same origin (production). */
  webDist?: string;
}

/** Builds the Express app without listening, so tests can drive it with supertest. */
export function createApp({
  env,
  logger,
  db,
  pingDb,
  sessionStore,
  storage,
  payments,
  bus,
  geocoder,
  webDist,
}: AppDeps) {
  const app = express();
  const users = usersRepository(db);
  const limiter = authRateLimit({ enabled: env.NODE_ENV !== 'test' });

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(
    helmet({
      // Upload previews are blob: URLs, QR codes data: URLs, and map tiles come from OpenStreetMap.
      contentSecurityPolicy: {
        directives: { 'img-src': ["'self'", 'data:', 'blob:', 'https://tile.openstreetmap.org'] },
      },
    }),
  );
  app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(pinoHttp({ logger }));
  // Uploaded images: public, cacheable, and served before sessions so they skip that work.
  if (storage.serve) app.use(UPLOADS_PUBLIC_PATH, storage.serve);
  // The web app's files and pages are public too; anything under /api falls through.
  if (webDist) app.use(webApp(webDist));
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
  const signer = ticketSigner(env.TICKET_SIGNING_SECRET);
  const tickets = ticketsService({ db, storage, signer });
  const gate = gateService({ db, storage, signer, bus });
  app.post('/api/events/:id/tickets', ...purchaseRoute(tickets));
  app.use('/api/events', publicEventsRoutes(events));
  app.use('/api/tickets', ticketsRoutes(tickets));
  app.use('/api/wallet', walletRoutes(walletService({ db, payments })));
  app.use('/api/admin/events', adminEventsRoutes(events));
  app.use('/api/gate', gateRoutes(gate, bus));
  app.use(
    '/api',
    socialRoutes(socialService({ db, storage }), { limitsEnabled: env.NODE_ENV !== 'test' }),
  );
  const community = communityService({ db, storage });
  app.use('/api', communityRoutes(community, { limitsEnabled: env.NODE_ENV !== 'test' }));
  app.use('/api/notifications', notificationsRoutes(notificationsService({ db })));
  app.use('/api/admin/dashboard', dashboardRoutes(dashboardService({ db })));
  app.use('/api/admin/users', adminUsersRoutes(adminUsersService({ db })));
  app.use('/api/admin/places', placesRoutes(geocoder, { limitsEnabled: env.NODE_ENV !== 'test' }));

  // Last: these routers guard everything under /api/admin that reaches them.
  app.use('/api/admin', adminGateRoutes(gate, bus));
  app.use('/api/admin', adminCommunityRoutes(community));
  app.use('/api/admin', adminAttendeesRoutes(attendeesService({ db })));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
