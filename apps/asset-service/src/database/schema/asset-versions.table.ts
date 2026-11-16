import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { ModelStats } from '../../assets/domain/model-stats.interface';
import type { ThumbnailRecord } from '../../assets/domain/thumbnail-record.interface';
import { assets } from './assets.table';

export const assetVersions = pgTable(
  'asset_versions',
  {
    /** Part of the object keys, so generated before INSERT. */
    id: uuid().primaryKey(),
    assetId: uuid()
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    number: integer().notNull(),
    status: text().notNull(),

    originalKey: text().notNull(),
    originalSizeBytes: bigint({ mode: 'number' }).notNull(),
    originalContentType: text().notNull(),
    originalFileName: text().notNull(),
    /** Never exposed outside the service; null once completed or aborted. */
    uploadId: text(),
    partSizeBytes: integer().notNull(),

    optimizedKey: text(),
    optimizedSizeBytes: bigint({ mode: 'number' }),
    optimizedContentType: text(),
    thumbnails: jsonb().$type<ThumbnailRecord[]>().notNull().default([]),
    stats: jsonb().$type<ModelStats>(),
    failureReason: text(),
    /** All three or none (ADR 017). */
    sourcePreviewKey: text(),
    sourcePreviewSizeBytes: bigint({ mode: 'number' }),
    sourcePreviewContentType: text(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    uploadedAt: timestamp({ withTimezone: true }),
    processingStartedAt: timestamp({ withTimezone: true }),
    processedAt: timestamp({ withTimezone: true }),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /** Also serves the foreign key on asset_id, so asset deletes don't scan this table. */
    uniqueIndex('asset_versions_asset_id_number_idx').on(table.assetId, table.number),
    index('asset_versions_status_idx').on(table.status),
    check(
      'asset_versions_source_preview_complete',
      sql`(${table.sourcePreviewKey} IS NULL) = (${table.sourcePreviewSizeBytes} IS NULL) AND (${table.sourcePreviewKey} IS NULL) = (${table.sourcePreviewContentType} IS NULL)`,
    ),
  ],
);
