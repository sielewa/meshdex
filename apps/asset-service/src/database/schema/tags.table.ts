import { sql } from 'drizzle-orm';
import { bigint, check, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/** The id is internal: an 8-byte key in `asset_tags` is much cheaper than repeating names. */
export const tags = pgTable(
  'tags',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    /** The check makes the database enforce the service's normalization. */
    name: text().notNull().unique('tags_name_unique'),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'tags_name_normalized',
      sql`${table.name} = lower(btrim(${table.name})) AND length(${table.name}) BETWEEN 1 AND 50`,
    ),
  ],
);
