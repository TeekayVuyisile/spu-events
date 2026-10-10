import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { Env } from './config/env';
import type { Logger } from './lib/logger';
import { errorHandler, notFound } from './middleware/error-handler';
import { healthRoutes } from './modules/health/health.routes';

export interface AppDeps {
  env: Pick<Env, 'WEB_ORIGIN'>;
  logger: Logger;
  pingDb: () => Promise<boolean>;
}

/** Builds the Express app without listening, so tests can drive it with supertest. */
export function createApp({ env, logger, pingDb }: AppDeps) {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(pinoHttp({ logger }));

  app.use('/api/health', healthRoutes(pingDb));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
