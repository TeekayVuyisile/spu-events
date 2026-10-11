/**
 * Runs before the server starts on each deploy: applies pending migrations, then,
 * when DEMO_PASSWORD is set and nobody has signed up yet, fills the database with
 * demo data. Safe to run on every start.
 */
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { loadEnv } from './config/env';
import { createDb } from './db/client';
import { storageFromEnv } from './lib/db-storage';
import { seedDemo } from './seed/demo';

const env = loadEnv();
const { db, pool } = createDb(env.DATABASE_URL);

try {
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations applied');

  if (env.DEMO_PASSWORD) {
    const { rows } = await pool.query<{ n: number }>('select count(*)::int as n from users');
    if (rows[0]!.n > 0) {
      console.log('Database already has accounts; skipping demo data');
    } else {
      await seedDemo({
        db,
        storage: storageFromEnv(env, db),
        signingSecret: env.TICKET_SIGNING_SECRET,
        password: env.DEMO_PASSWORD,
      });
      console.log('Demo data ready');
    }
  }
} finally {
  await pool.end();
}
