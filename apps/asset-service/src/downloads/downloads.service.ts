import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { validate as isUuid } from 'uuid';
import { downloadConfig } from '../config/config.namespaces';
import type { ObjectStorage } from '../storage/domain/object-storage-port.interface';
import { OBJECT_STORAGE } from '../storage/storage.tokens';
import { MAX_DOWNLOAD_URL_IDS, MS_PER_SECOND } from './downloads.constants';
import type { OriginalDownloadUrl } from './domain/original-download-url.interface';
import { InvalidDownloadRequestException } from './exceptions/invalid-download-request.exception';
import { StoredOriginalsRepository } from './infrastructure/stored-originals.repository';

/**
 * Short-lived read access to original uploads (ADR 010). The bucket stays private; a URL
 * grants access to one object until it expires, and is handed out only on request.
 */
@Injectable()
export class DownloadsService {
  constructor(
    private readonly storedOriginalsRepository: StoredOriginalsRepository,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(downloadConfig.KEY) private readonly config: ConfigType<typeof downloadConfig>,
  ) {}

  /**
   * URLs in request order (duplicates collapsed). Versions without a complete original are
   * left out rather than failing the batch: one pending upload must not hide the rest.
   */
  async getOriginalDownloadUrls(requestedIds: string[]): Promise<OriginalDownloadUrl[]> {
    const ids = [...new Set(requestedIds)];

    if (ids.length > MAX_DOWNLOAD_URL_IDS) {
      throw new InvalidDownloadRequestException(
        `At most ${String(MAX_DOWNLOAD_URL_IDS)} version ids per call`,
      );
    }

    const malformed = ids.filter((id) => !isUuid(id));

    if (malformed.length > 0) {
      throw new InvalidDownloadRequestException(
        `Asset version ids are not UUIDs: ${malformed.join(', ')}`,
      );
    }

    const keysById = new Map(
      (await this.storedOriginalsRepository.findAllByVersionIds(ids)).map((original) => [
        original.versionId,
        original.originalKey,
      ]),
    );
    // Taken before signing, so every URL stays valid at least until the reported instant.
    const expiresAt = Date.now() + this.config.urlTtlSeconds * MS_PER_SECOND;

    return Promise.all(
      ids.flatMap((id) => {
        const key = keysById.get(id);

        return key === undefined ? [] : [this.sign(id, key, expiresAt)];
      }),
    );
  }

  private async sign(
    versionId: string,
    key: string,
    expiresAt: number,
  ): Promise<OriginalDownloadUrl> {
    return {
      versionId,
      url: await this.storage.presignDownload(key, this.config.urlTtlSeconds),
      expiresAt,
    };
  }
}
