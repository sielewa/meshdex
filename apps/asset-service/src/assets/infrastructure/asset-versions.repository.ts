import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DATABASE, type Database, type DbExecutor } from '../../database/database.types';
import { assetVersions } from '../../database/schema';
import { AssetVersionStatus, parseAssetVersionStatus } from '../domain/asset-version-status.enum';
import type { VersionUpload } from '../domain/version-upload.interface';

export interface NewVersionUpload {
  id: string;
  assetId: string;
  number: number;
  originalKey: string;
  originalFileName: string;
  sizeBytes: number;
  contentType: string;
  uploadId: string;
  partSizeBytes: number;
  createdAt: number;
}

@Injectable()
export class AssetVersionsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async createUploading(version: NewVersionUpload, tx: DbExecutor): Promise<void> {
    const createdAt = new Date(version.createdAt);

    await tx.insert(assetVersions).values({
      id: version.id,
      assetId: version.assetId,
      number: version.number,
      status: AssetVersionStatus.UPLOADING,
      originalKey: version.originalKey,
      originalFileName: version.originalFileName,
      originalSizeBytes: version.sizeBytes,
      originalContentType: version.contentType,
      uploadId: version.uploadId,
      partSizeBytes: version.partSizeBytes,
      createdAt,
      updatedAt: createdAt,
    });
  }

  async findUploadById(versionId: string): Promise<VersionUpload | null> {
    const [row] = await this.db
      .select({
        versionId: assetVersions.id,
        assetId: assetVersions.assetId,
        number: assetVersions.number,
        status: assetVersions.status,
        originalKey: assetVersions.originalKey,
        sizeBytes: assetVersions.originalSizeBytes,
        contentType: assetVersions.originalContentType,
        uploadId: assetVersions.uploadId,
        partSizeBytes: assetVersions.partSizeBytes,
      })
      .from(assetVersions)
      .where(eq(assetVersions.id, versionId))
      .limit(1);

    return row ? { ...row, status: parseAssetVersionStatus(row.status) } : null;
  }

  /**
   * UPLOADING -> UPLOADED, only if the version is still UPLOADING. Returns false when
   * another call already did it (a retried or concurrent CompleteUpload), so the caller
   * can skip side effects such as the outbox event — exactly one transition wins.
   */
  async markUploaded(versionId: string, uploadedAt: number, tx: DbExecutor): Promise<boolean> {
    const at = new Date(uploadedAt);
    const updated = await tx
      .update(assetVersions)
      .set({ status: AssetVersionStatus.UPLOADED, uploadId: null, uploadedAt: at, updatedAt: at })
      .where(
        and(
          eq(assetVersions.id, versionId),
          eq(assetVersions.status, AssetVersionStatus.UPLOADING),
        ),
      )
      .returning({ id: assetVersions.id });

    return updated.length === 1;
  }

  async deleteById(versionId: string, tx: DbExecutor): Promise<void> {
    await tx.delete(assetVersions).where(eq(assetVersions.id, versionId));
  }
}
