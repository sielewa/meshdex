import { Injectable } from '@nestjs/common';
import { validate as isUuid } from 'uuid';
import type { Asset } from '../assets/domain/asset.interface';
import type { AssetVersion } from '../assets/domain/asset-version.interface';
import { DEFAULT_PAGE_SIZE, MAX_BATCH_GET_IDS, MAX_PAGE_SIZE } from './catalog.constants';
import type { AssetPage } from './domain/asset-page.interface';
import type { BatchGetResult } from './domain/batch-get-result.interface';
import type { ListAssetsQuery } from './domain/list-assets-query.interface';
import { AssetNotFoundException } from './exceptions/asset-not-found.exception';
import { InvalidCatalogRequestException } from './exceptions/invalid-catalog-request.exception';
import { AssetListRepository } from './infrastructure/asset-list.repository';
import { AssetViewsRepository } from './infrastructure/asset-views.repository';

/** Read side of the asset catalog. Any module may read; writes live in `assets` (ADR 005). */
@Injectable()
export class CatalogService {
  constructor(
    private readonly assetViewsRepository: AssetViewsRepository,
    private readonly assetListRepository: AssetListRepository,
  ) {}

  async getAsset(assetId: string): Promise<Asset> {
    this.assertAssetIds([assetId]);
    const [asset] = await this.assetViewsRepository.findByIds([assetId]);

    if (!asset) {
      throw new AssetNotFoundException(`Asset ${assetId} not found`);
    }

    return asset;
  }

  async getAssetVersion(versionId: string): Promise<AssetVersion> {
    const version = await this.assetViewsRepository.findVersionById(versionId);

    if (!version) {
      throw new AssetNotFoundException(`Asset version ${versionId} not found`);
    }

    return version;
  }

  /**
   * Many assets in one call, in the order asked for (search ranking). Missing ids are
   * reported, not treated as an error: another service may still know an asset that
   * was deleted here (eventual consistency).
   */
  async batchGet(requestedIds: string[]): Promise<BatchGetResult> {
    const ids = [...new Set(requestedIds)];

    if (ids.length > MAX_BATCH_GET_IDS) {
      throw new InvalidCatalogRequestException(`At most ${String(MAX_BATCH_GET_IDS)} ids per call`);
    }

    this.assertAssetIds(ids);

    const byId = new Map(
      (await this.assetViewsRepository.findByIds(ids)).map((asset) => [asset.id, asset]),
    );

    return {
      assets: ids.flatMap((id) => {
        const asset = byId.get(id);

        return asset ? [asset] : [];
      }),
      notFoundIds: ids.filter((id) => !byId.has(id)),
    };
  }

  async list(query: ListAssetsQuery): Promise<AssetPage> {
    const pageSize = query.pageSize === 0 ? DEFAULT_PAGE_SIZE : query.pageSize;

    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
      throw new InvalidCatalogRequestException(
        `Page size must be between 1 and ${String(MAX_PAGE_SIZE)}`,
      );
    }

    // One extra row tells whether another page exists, without a COUNT(*).
    const positions = await this.assetListRepository.findPage(
      {
        statuses: query.statuses,
        tag: query.tag.trim().toLowerCase() || null,
      },
      query.after,
      pageSize + 1,
    );
    const pagePositions = positions.slice(0, pageSize);
    const hasMore = positions.length > pageSize;
    const { assets } = await this.batchGet(pagePositions.map((position) => position.id));

    return {
      assets,
      next: hasMore ? (pagePositions.at(-1) ?? null) : null,
    };
  }

  /**
   * Malformed ids can't name an asset. They are rejected before the query, where Postgres
   * would fail on the uuid column (22P02) and turn a caller's mistake into INTERNAL.
   */
  private assertAssetIds(ids: string[]): void {
    const malformed = ids.filter((id) => !isUuid(id));

    if (malformed.length > 0) {
      throw new InvalidCatalogRequestException(`Asset ids are not UUIDs: ${malformed.join(', ')}`);
    }
  }
}
