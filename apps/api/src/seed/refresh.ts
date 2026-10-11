import { sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { demoState } from '../db/schema';
import type { StorageService } from '../lib/storage';
import { seedDemo } from './demo';

export interface DemoOptions {
  db: Db;
  storage: StorageService;
  signingSecret: string;
  password: string;
  /** Wipe and re-seed once the data is this old. Unset: seed an empty database only. */
  resetHours?: number;
  log?: (message: string) => void;
  now?: () => Date;
}

export type DemoOutcome = 'seeded' | 'reset' | 'fresh' | 'kept';

/** Empties every table in the app's schema (Drizzle's migration history lives in its own schema). */
async function wipe(db: Db) {
  const { rows } = await db.execute<{ name: string }>(
    sql`select quote_ident(tablename) as name from pg_tables where schemaname = 'public'`,
  );
  if (rows.length === 0) return;
  await db.execute(
    sql.raw(`truncate ${rows.map((r) => r.name).join(', ')} restart identity cascade`),
  );
}

async function seed({ db, log = console.log, ...rest }: DemoOptions) {
  await seedDemo({ db, log, ...rest });
  await db
    .insert(demoState)
    .values({ seededAt: sql`now()` })
    .onConflictDoUpdate({ target: demoState.id, set: { seededAt: sql`now()` } });
}

/**
 * Seeds an empty database, and on a public demo (resetHours set) wipes and re-seeds
 * once visitors have had the data for long enough. Re-seeding also moves every
 * event date forward, so "upcoming" events never drift into the past.
 */
export async function refreshDemo(options: DemoOptions): Promise<DemoOutcome> {
  const { db, resetHours, log = console.log, now = () => new Date() } = options;
  const { rows } = await db.execute<{ n: number }>(sql`select count(*)::int as n from users`);
  if (rows[0]!.n === 0) {
    await seed(options);
    return 'seeded';
  }
  if (!resetHours) return 'kept';

  const [state] = await db.select().from(demoState);
  // No record means the data predates resets; treat it as stale.
  const age = state ? now().getTime() - state.seededAt.getTime() : Infinity;
  if (age < resetHours * 3_600_000) return 'fresh';

  log('Demo data is stale; resetting');
  await wipe(db);
  await seed(options);
  return 'reset';
}

/**
 * Re-checks every few minutes while the server runs, for when visitors keep the
 * instance awake past the reset time. Returns a function that stops the checks.
 */
export function scheduleDemoRefresh(
  options: DemoOptions & { onError: (err: unknown) => void },
  everyMs = 10 * 60_000,
) {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    refreshDemo(options)
      .catch(options.onError)
      .finally(() => (running = false));
  }, everyMs);
  timer.unref();
  return () => clearInterval(timer);
}
