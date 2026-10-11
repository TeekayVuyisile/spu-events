import connectPgSimple from 'connect-pg-simple';
import session from 'express-session';
import { createApp } from './app';
import { loadEnv } from './config/env';
import { createDb } from './db/client';
import { createLogger } from './lib/logger';
import { inProcessBus } from './lib/live-bus';
import { simulatedPayments } from './lib/payments';
import { storageFromEnv } from './lib/db-storage';

const env = loadEnv();
const logger = createLogger(env);
const { db, pool } = createDb(env.DATABASE_URL);

// The sessions table comes from our Drizzle migrations, not from connect-pg-simple.
const PgStore = connectPgSimple(session);
const sessionStore = new PgStore({ pool, tableName: 'sessions', pruneSessionInterval: 15 * 60 });

const app = createApp({
  env,
  logger,
  db,
  sessionStore,
  storage: storageFromEnv(env, db),
  // TODO: swap for a real gateway (PayFast, Yoco…) before handling real money.
  payments: simulatedPayments(),
  // Single-instance fan-out; see lib/live-bus.ts before running more than one API process.
  bus: inProcessBus(),
  pingDb: async () => (await pool.query('select 1')).rowCount === 1,
  webDist: env.WEB_DIST_DIR,
});

const server = app.listen(env.PORT, () => {
  logger.info(`API listening on port ${env.PORT}`);
});

async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  server.close();
  sessionStore.close();
  await pool.end();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
