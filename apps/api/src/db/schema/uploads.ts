import { customType, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });

/**
 * Uploaded files, for hosts without a persistent disk (STORAGE=database). Uploads are
 * capped at 5 MB each, so a free Postgres tier comfortably holds a demo's worth.
 */
export const uploads = pgTable(
  'uploads',
  {
    key: text().primaryKey(),
    contentType: text().notNull(),
    data: bytea().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.createdAt)],
);
