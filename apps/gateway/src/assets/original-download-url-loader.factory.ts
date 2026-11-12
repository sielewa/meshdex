import { Inject, Injectable } from '@nestjs/common';
import DataLoader from 'dataloader';
import { MAX_DOWNLOAD_URL_IDS } from '../clients/asset-service/asset-service.constants';
import { ASSET_SERVICE } from '../clients/asset-service/asset-service.tokens';
import type { AssetServicePort } from '../clients/asset-service/domain/asset-service-port.interface';
import type { OriginalDownloadUrl } from '../clients/asset-service/domain/original-download-url.interface';

/**
 * Per-request DataLoader for `AssetVersion.originalDownloadUrl`: every version in one
 * response is signed in a single GetOriginalDownloadUrls call, however many assets the
 * query selects. Per request, like `AssetLoaderFactory`, so URLs are never served from a
 * cache that outlives the request (they expire).
 */
@Injectable()
export class OriginalDownloadUrlLoaderFactory {
  constructor(@Inject(ASSET_SERVICE) private readonly assetService: AssetServicePort) {}

  create(): DataLoader<string, OriginalDownloadUrl | null> {
    return new DataLoader<string, OriginalDownloadUrl | null>((ids) => this.loadBatch(ids), {
      maxBatchSize: MAX_DOWNLOAD_URL_IDS,
    });
  }

  /** One result per key, in key order; versions without a stored original become `null`. */
  private async loadBatch(ids: readonly string[]): Promise<(OriginalDownloadUrl | null)[]> {
    const urls = await this.assetService.getOriginalDownloadUrls(ids);
    const byVersionId = new Map(urls.map((download) => [download.versionId, download]));

    return ids.map((id) => byVersionId.get(id) ?? null);
  }
}
