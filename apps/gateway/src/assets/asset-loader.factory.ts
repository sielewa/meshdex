import { Inject, Injectable } from '@nestjs/common';
import DataLoader from 'dataloader';
import { MAX_BATCH_GET_IDS } from '../clients/asset-service/asset-service.constants';
import { ASSET_SERVICE } from '../clients/asset-service/asset-service.tokens';
import type { Asset } from '../clients/asset-service/domain/asset.interface';
import type { AssetServicePort } from '../clients/asset-service/domain/asset-service-port.interface';

/**
 * Creates the per-request asset DataLoader. Every `load(id)` made while one GraphQL
 * request resolves a level of the query is collected and sent as one BatchGetAssets
 * call, and repeated ids are served from the loader's cache: N fields → 1 RPC, not N.
 *
 * A new loader per request (not a singleton) because the cache must not outlive the
 * request: it would serve stale data and, once auth exists, data across users.
 * Created from the GraphQL context factory instead of a REQUEST-scoped provider, which
 * would make every resolver depending on it request-scoped too.
 */
@Injectable()
export class AssetLoaderFactory {
  constructor(@Inject(ASSET_SERVICE) private readonly assetService: AssetServicePort) {}

  create(): DataLoader<string, Asset | null> {
    return new DataLoader<string, Asset | null>((ids) => this.loadBatch(ids), {
      maxBatchSize: MAX_BATCH_GET_IDS,
    });
  }

  /** DataLoader's contract: one result per key, in key order; missing ids become `null`. */
  private async loadBatch(ids: readonly string[]): Promise<(Asset | null)[]> {
    const assets = await this.assetService.batchGetAssets(ids);
    const byId = new Map(assets.map((asset) => [asset.id, asset]));

    return ids.map((id) => byId.get(id) ?? null);
  }
}
