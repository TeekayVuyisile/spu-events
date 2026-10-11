/**
 * Runs before the server starts on each deploy: applies pending migrations, then,
 * when DEMO_PASSWORD is set, fills an empty database with demo data (or, with
 * DEMO_RESET_HOURS, replaces stale demo data). Safe to run on every start.
 */
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { loadEnv } from './config/env';
import { createDb } from './db/client';
import { storageFromEnv } from './lib/db-storage';
import { refreshDemo } from './seed/refresh';

const env = loadEnv();
const { db, pool } = createDb(env.DATABASE_URL);

try {
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations applied');

  if (env.DEMO_PASSWORD) {
    const outcome = await refreshDemo({
      db,
      storage: storageFromEnv(env, db),
      signingSecret: env.TICKET_SIGNING_SECRET,
      password: env.DEMO_PASSWORD,
      resetHours: env.DEMO_RESET_HOURS,
    });
    console.log(
      {
        seeded: 'Demo data ready',
        reset: 'Demo data reset',
        fresh: 'Demo data is recent; keeping it',
        kept: 'Database already has accounts; skipping demo data',
      }[outcome],
    );
  }
} finally {
  await pool.end();
}
