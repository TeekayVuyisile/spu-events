import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import { createDb } from '../src/db/client';
import { testDatabaseUrl } from './test-db-url';

/** Brings the test database up to the latest migration once per `vitest run`. */
export default async function setup() {
  const { db, pool } = createDb(testDatabaseUrl());
  try {
    await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
  } finally {
    await pool.end();
  }
}
