import { sql } from 'drizzle-orm';
import { bigint, check, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Tag dictionary. The API speaks tag names; the numeric id is internal and only
 * used by `asset_tags`, where an 8-byte key is much cheaper than repeating text
 * (that join table has a row per asset-tag pair). Renaming a tag touches one row.
 */
export const tags = pgTable(
  'tags',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    /** Normalized by the service (trimmed, lower-case); the check makes the database enforce it too. */
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
