import { bigint, index, pgTable, primaryKey, uuid } from 'drizzle-orm/pg-core';
import { assets } from './assets.table';
import { tags } from './tags.table';

/** Many-to-many link between assets and tags. */
export const assetTags = pgTable(
  'asset_tags',
  {
    assetId: uuid()
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    tagId: bigint({ mode: 'number' })
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (table) => [
    /** Also indexes `asset_id` (leading column): "tags of these assets" and cascades from `assets`. */
    primaryKey({
      name: 'asset_tags_pk',
      columns: [table.assetId, table.tagId],
    }),
    /** The reverse direction: "assets with this tag" and cascades from `tags`. */
    index('asset_tags_tag_id_asset_id_idx').on(table.tagId, table.assetId),
  ],
);
