import { Inject, Injectable } from '@nestjs/common';
import { desc, eq, inArray } from 'drizzle-orm';
import { DATABASE } from '../../database/database.tokens';
import type { Database } from '../../database/domain/database.type';
import type { DbExecutor } from '../../database/domain/db-executor.type';
import { assetTags, assets, assetVersions, tags } from '../../database/schema';
import type { Asset } from '../../assets/domain/asset.interface';
import type { AssetVersion } from '../../assets/domain/asset-version.interface';
import { AssetVersionStatus } from '../../assets/domain/asset-version-status.enum';

/**
 * Assembles full `Asset` views (asset + current version + tags) for many ids at once:
 * three queries however many ids are asked for, instead of 1 + 2N (the N+1 problem).
 */
@Injectable()
export class AssetViewsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findVersionById(versionId: string): Promise<AssetVersion | null> {
    const [row] = await this.db
      .select()
      .from(assetVersions)
      .where(eq(assetVersions.id, versionId))
      .limit(1);

    return row ? this.toAssetVersion(row) : null;
  }

  /** Returns found assets in no particular order; callers restore the order they need. */
  async findByIds(ids: string[], executor: DbExecutor = this.db): Promise<Asset[]> {
    if (ids.length === 0) {
      return [];
    }

    const assetRows = await executor.select().from(assets).where(inArray(assets.id, ids));

    // DISTINCT ON keeps the first row per asset in ORDER BY — the highest version number.
    const versionRows = await executor
      .selectDistinctOn([assetVersions.assetId])
      .from(assetVersions)
      .where(inArray(assetVersions.assetId, ids))
      .orderBy(assetVersions.assetId, desc(assetVersions.number));

    const tagRows = await executor
      .select({
        assetId: assetTags.assetId,
        name: tags.name,
      })
      .from(assetTags)
      .innerJoin(tags, eq(tags.id, assetTags.tagId))
      .where(inArray(assetTags.assetId, ids))
      .orderBy(tags.name);

    const versionsByAsset = new Map(
      versionRows.map((row) => [row.assetId, this.toAssetVersion(row)]),
    );
    const tagsByAsset = new Map<string, string[]>();

    for (const { assetId, name } of tagRows) {
      tagsByAsset.set(assetId, [...(tagsByAsset.get(assetId) ?? []), name]);
    }

    return assetRows.flatMap((row) => {
      const currentVersion = versionsByAsset.get(row.id);

      return currentVersion
        ? [
            {
              id: row.id,
              title: row.title,
              tags: tagsByAsset.get(row.id) ?? [],
              currentVersion,
              createdAt: row.createdAt.getTime(),
              updatedAt: row.updatedAt.getTime(),
            },
          ]
        : [];
    });
  }

  private toAssetVersion(row: typeof assetVersions.$inferSelect): AssetVersion {
    return {
      id: row.id,
      assetId: row.assetId,
      number: row.number,
      status: this.parseStatus(row.status),
      original: {
        key: row.originalKey,
        sizeBytes: row.originalSizeBytes,
        contentType: row.originalContentType,
      },
      optimized:
        row.optimizedKey !== null &&
        row.optimizedSizeBytes !== null &&
        row.optimizedContentType !== null
          ? {
              key: row.optimizedKey,
              sizeBytes: row.optimizedSizeBytes,
              contentType: row.optimizedContentType,
            }
          : null,
      thumbnails: row.thumbnails.map((thumbnail) => ({
        object: {
          key: thumbnail.key,
          sizeBytes: thumbnail.sizeBytes,
          contentType: thumbnail.contentType,
        },
        width: thumbnail.width,
        height: thumbnail.height,
        view: thumbnail.view,
      })),
      stats: row.stats ?? null,
      failureReason: row.failureReason,
      createdAt: row.createdAt.getTime(),
      processedAt: row.processedAt?.getTime() ?? null,
    };
  }

  /** Narrows a status read from the database; an unknown value means corrupted data, not user error. */
  private parseStatus(value: string): AssetVersionStatus {
    if (!this.isKnownStatus(value)) {
      throw new Error(`Unknown asset version status in database: "${value}"`);
    }

    return value;
  }

  /** Type guard: narrows the type only when the runtime check passed (no blind `as`). */
  private isKnownStatus(value: string): value is AssetVersionStatus {
    return (Object.values(AssetVersionStatus) as string[]).includes(value);
  }
}
