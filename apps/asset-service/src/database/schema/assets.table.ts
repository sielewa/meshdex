import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** The current version is the highest-numbered one: a column would be a circular foreign key. */
export const assets = pgTable(
  'assets',
  {
    id: uuid().primaryKey(),
    title: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /** NULLS FIRST matches DESC's default; otherwise the planner sorts in memory (keyset pagination). */
    index('assets_created_at_id_idx').on(
      table.createdAt.desc().nullsFirst(),
      table.id.desc().nullsFirst(),
    ),
  ],
);
