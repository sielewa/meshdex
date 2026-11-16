import { Inject, Injectable } from '@nestjs/common';
import { and, inArray, ne } from 'drizzle-orm';
import { AssetVersionStatus } from '../../assets/domain/asset-version-status.enum';
import { DATABASE } from '../../database/database.tokens';
import type { Database } from '../../database/domain/database.type';
import { assetVersions } from '../../database/schema';
import type { StoredOriginal } from '../domain/stored-original.interface';

@Injectable()
export class StoredOriginalsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Every status after UPLOADING; an aborted upload has no row. */
  async findAllByVersionIds(versionIds: string[]): Promise<StoredOriginal[]> {
    if (versionIds.length === 0) {
      return [];
    }

    return this.db
      .select({
        versionId: assetVersions.id,
        originalKey: assetVersions.originalKey,
      })
      .from(assetVersions)
      .where(
        and(
          inArray(assetVersions.id, versionIds),
          ne(assetVersions.status, AssetVersionStatus.UPLOADING),
        ),
      );
  }
}
