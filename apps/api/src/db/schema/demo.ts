import { sql } from 'drizzle-orm';
import { check, pgTable, smallint, timestamp } from 'drizzle-orm/pg-core';

/**
 * One row recording when the demo data was last seeded, so a public demo can
 * reset itself after visitors have had their way with it (DEMO_RESET_HOURS).
 */
export const demoState = pgTable(
  'demo_state',
  {
    id: smallint().primaryKey().default(1),
    seededAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('demo_state_single_row', sql`${t.id} = 1`)],
);
