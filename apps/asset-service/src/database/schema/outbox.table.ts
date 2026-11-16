import { sql } from 'drizzle-orm';
import { bigint, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** Written in the state change's transaction; publishing next to the commit could lose events. */
export const outbox = pgTable(
  'outbox',
  {
    /** UUIDv7 can't order two events from the same millisecond (ADR 003). */
    sequence: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    /** Consumers' idempotency key. */
    // Explicit name: drizzle-kit doesn't apply `casing` to generated constraint names.
    eventId: uuid().notNull().unique('outbox_event_id_unique'),
    topic: text().notNull(),
    /** The asset id, so one asset's events keep their order in one partition. */
    key: text().notNull(),
    type: text().notNull(),
    payload: jsonb().notNull(),
    occurredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    /** Partial index: the relay only ever scans unpublished rows, which stay few. */
    index('outbox_unpublished_idx')
      .on(table.sequence)
      .where(sql`${table.publishedAt} IS NULL`),
  ],
);
