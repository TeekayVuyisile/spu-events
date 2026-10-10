import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { loadEnv } from '../config/env';
import { createDb } from './client';

// Applies pending SQL migrations from ./drizzle. Safe to run repeatedly.
const env = loadEnv();
const { db, pool } = createDb(env.DATABASE_URL);

try {
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations applied');
} finally {
  await pool.end();
}
