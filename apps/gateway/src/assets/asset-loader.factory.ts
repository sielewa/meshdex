import { Inject, Injectable } from '@nestjs/common';
import DataLoader from 'dataloader';
import { MAX_BATCH_GET_IDS } from '../clients/asset-service/asset-service.constants';
import { ASSET_SERVICE } from '../clients/asset-service/asset-service.tokens';
import type { Asset } from '../clients/asset-service/domain/asset.interface';
import type { AssetServicePort } from '../clients/asset-service/domain/asset-service-port.interface';

/**
 * Loads of one query level become one BatchGetAssets call. One loader per request so its cache
 * can't serve stale data or other users' data; built in the GraphQL context, because a
 * REQUEST-scoped provider would make every dependent resolver request-scoped too.
 */
@Injectable()
export class AssetLoaderFactory {
  constructor(@Inject(ASSET_SERVICE) private readonly assetService: AssetServicePort) {}

  create(): DataLoader<string, Asset | null> {
    return new DataLoader<string, Asset | null>((ids) => this.loadBatch(ids), {
      maxBatchSize: MAX_BATCH_GET_IDS,
    });
  }

  /** DataLoader's contract: one result per key, in key order. */
  private async loadBatch(ids: readonly string[]): Promise<(Asset | null)[]> {
    const assets = await this.assetService.batchGetAssets(ids);
    const byId = new Map(assets.map((asset) => [asset.id, asset]));

    return ids.map((id) => byId.get(id) ?? null);
  }
}
