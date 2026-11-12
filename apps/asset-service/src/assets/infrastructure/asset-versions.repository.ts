import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DATABASE } from '../../database/database.tokens';
import type { Database } from '../../database/domain/database.type';
import type { DbExecutor } from '../../database/domain/db-executor.type';
import { assetVersions } from '../../database/schema';
import { AssetVersionStatus } from '../domain/asset-version-status.enum';
import type { ProcessingOutputs } from '../domain/processing-outputs.interface';
import type { VersionUpload } from '../domain/version-upload.interface';
import type { NewVersionUpload } from '../domain/new-version-upload.interface';

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
      sourcePreviewKey: version.sourcePreview?.key ?? null,
      sourcePreviewSizeBytes: version.sourcePreview?.sizeBytes ?? null,
      sourcePreviewContentType: version.sourcePreview?.contentType ?? null,
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
        sourcePreviewKey: assetVersions.sourcePreviewKey,
        sourcePreviewSizeBytes: assetVersions.sourcePreviewSizeBytes,
        sourcePreviewContentType: assetVersions.sourcePreviewContentType,
      })
      .from(assetVersions)
      .where(eq(assetVersions.id, versionId))
      .limit(1);

    if (!row) {
      return null;
    }

    const { sourcePreviewKey, sourcePreviewSizeBytes, sourcePreviewContentType, ...upload } = row;

    return {
      ...upload,
      status: this.parseStatus(row.status),
      sourcePreview:
        sourcePreviewKey !== null &&
        sourcePreviewSizeBytes !== null &&
        sourcePreviewContentType !== null
          ? {
              key: sourcePreviewKey,
              sizeBytes: sourcePreviewSizeBytes,
              contentType: sourcePreviewContentType,
            }
          : null,
    };
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
      .set({
        status: AssetVersionStatus.UPLOADED,
        uploadId: null,
        uploadedAt: at,
        updatedAt: at,
      })
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

  /** UPLOADED -> PROCESSING; false if the version wasn't UPLOADED (see `markUploaded`). */
  async markProcessing(versionId: string, startedAt: number): Promise<boolean> {
    const at = new Date(startedAt);

    return this.transition(versionId, AssetVersionStatus.UPLOADED, {
      status: AssetVersionStatus.PROCESSING,
      processingStartedAt: at,
      updatedAt: at,
    });
  }

  /** PROCESSING -> READY with everything the worker produced. */
  async markReady(
    versionId: string,
    outputs: ProcessingOutputs,
    processedAt: number,
  ): Promise<boolean> {
    const at = new Date(processedAt);

    return this.transition(versionId, AssetVersionStatus.PROCESSING, {
      status: AssetVersionStatus.READY,
      optimizedKey: outputs.optimized.key,
      optimizedSizeBytes: outputs.optimized.sizeBytes,
      optimizedContentType: outputs.optimized.contentType,
      thumbnails: outputs.thumbnails.map((thumbnail) => ({
        key: thumbnail.object.key,
        sizeBytes: thumbnail.object.sizeBytes,
        contentType: thumbnail.object.contentType,
        width: thumbnail.width,
        height: thumbnail.height,
        view: thumbnail.view,
      })),
      stats: outputs.stats,
      processedAt: at,
      updatedAt: at,
    });
  }

  /** PROCESSING -> FAILED. */
  async markFailed(versionId: string, reason: string, processedAt: number): Promise<boolean> {
    const at = new Date(processedAt);

    return this.transition(versionId, AssetVersionStatus.PROCESSING, {
      status: AssetVersionStatus.FAILED,
      failureReason: reason,
      processedAt: at,
      updatedAt: at,
    });
  }

  /** Conditional update: applies only when the version is still in `from` (no lost updates). */
  private async transition(
    versionId: string,
    from: AssetVersionStatus,
    changes: Partial<typeof assetVersions.$inferInsert>,
  ): Promise<boolean> {
    const updated = await this.db
      .update(assetVersions)
      .set(changes)
      .where(and(eq(assetVersions.id, versionId), eq(assetVersions.status, from)))
      .returning({ id: assetVersions.id });

    return updated.length === 1;
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
