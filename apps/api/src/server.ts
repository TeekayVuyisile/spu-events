import { createApp } from './app';
import { loadEnv } from './config/env';
import { createDb } from './db/client';
import { createLogger } from './lib/logger';

const env = loadEnv();
const logger = createLogger(env);
const { pool } = createDb(env.DATABASE_URL);

const app = createApp({
  env,
  logger,
  pingDb: async () => (await pool.query('select 1')).rowCount === 1,
});

const server = app.listen(env.PORT, () => {
  logger.info(`API listening on http://localhost:${env.PORT}`);
});

async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  server.close();
  await pool.end();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
