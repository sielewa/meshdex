import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, exists, inArray, sql, type SQL } from 'drizzle-orm';
import { DATABASE } from '../../database/database.tokens';
import type { Database } from '../../database/domain/database.type';
import { assetTags, assets, assetVersions, tags } from '../../database/schema';
import type { AssetListFilter } from '../domain/asset-list-filter.interface';
import type { PageCursor } from '../domain/page-cursor.interface';

@Injectable()
export class AssetListRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * One page of asset positions, newest first, using keyset pagination on
   * `assets_created_at_id_idx`: the cost of a page doesn't grow with how deep the
   * client has paged (unlike OFFSET). Returns `limit` rows; ask for one more than the
   * page size to learn whether another page exists.
   */
  async findPage(
    filter: AssetListFilter,
    after: PageCursor | null,
    limit: number,
  ): Promise<PageCursor[]> {
    const conditions: SQL[] = [];

    if (after) {
      // Row comparison matches the index order (created_at DESC, id DESC).
      conditions.push(
        sql`(${assets.createdAt}, ${assets.id}) < (${new Date(after.createdAt)}, ${after.id})`,
      );
    }

    if (filter.tag) {
      conditions.push(
        exists(
          this.db
            .select({ one: sql`1` })
            .from(assetTags)
            .innerJoin(tags, eq(tags.id, assetTags.tagId))
            .where(and(eq(assetTags.assetId, assets.id), eq(tags.name, filter.tag))),
        ),
      );
    }

    if (filter.statuses.length > 0) {
      // Status of the current (highest-numbered) version.
      const currentStatus = sql`(
        SELECT ${assetVersions.status} FROM ${assetVersions}
        WHERE ${assetVersions.assetId} = ${assets.id}
        ORDER BY ${assetVersions.number} DESC LIMIT 1
      )`;
      conditions.push(inArray(currentStatus, filter.statuses));
    }

    const rows = await this.db
      .select({
        id: assets.id,
        createdAt: assets.createdAt,
      })
      .from(assets)
      .where(and(...conditions))
      .orderBy(desc(assets.createdAt), desc(assets.id))
      .limit(limit);

    return rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.getTime(),
    }));
  }
}
