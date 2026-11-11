import { sql } from 'drizzle-orm';
import { bigint, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Transactional outbox: an integration event is inserted in the same transaction
 * as the state change it describes, and a relay publishes it to Kafka afterwards.
 * Publishing directly next to the DB commit (dual write) could lose or invent events.
 */
export const outbox = pgTable(
  'outbox',
  {
    /** Publish order. UUIDv7 can't order two events from the same millisecond (ADR 003). */
    sequence: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    /** Identity of the event for consumers (idempotency key in `processed_events`). */
    // Explicit name: drizzle-kit doesn't apply `casing` to generated constraint names.
    eventId: uuid().notNull().unique('outbox_event_id_unique'),
    /** Kafka topic, e.g. `asset.events.v1`. */
    topic: text().notNull(),
    /** Kafka message key — the asset id, so one asset's events keep their order in one partition. */
    key: text().notNull(),
    /** Event type, e.g. `asset.uploaded`. */
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
