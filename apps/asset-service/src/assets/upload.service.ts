import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { v7 as uuidv7 } from 'uuid';
import { uploadConfig } from '../config/config.namespaces';
import { DATABASE, type Database } from '../database/database.types';
import {
  OBJECT_STORAGE,
  StoragePartsRejectedException,
  StorageUploadNotFoundException,
  type ObjectStorage,
  type UploadedPart,
} from '../storage/domain/object-storage-port.interface';
import {
  ASSET_EVENTS_TOPIC,
  ASSET_UPLOADED_EVENT,
  GLB_CONTENT_TYPE,
  GLB_EXTENSION,
  MAX_TITLE_LENGTH,
  MAX_UPLOAD_PARTS,
} from './assets.constants';
import type { Asset } from './domain/asset.interface';
import { AssetVersionStatus } from './domain/asset-version-status.enum';
import { normalizeTagNames } from './domain/tag-names';
import {
  countParts,
  originalObjectKey,
  resolvePartNumbers,
  validateCompletedParts,
} from './domain/upload-plan';
import type { VersionUpload } from './domain/version-upload.interface';
import { AssetVersionNotFoundException } from './exceptions/asset-version-not-found.exception';
import { InvalidUploadRequestException } from './exceptions/invalid-upload-request.exception';
import { UploadNotInProgressException } from './exceptions/upload-not-in-progress.exception';
import { AssetViewsRepository } from './infrastructure/asset-views.repository';
import { AssetVersionsRepository } from './infrastructure/asset-versions.repository';
import { AssetsRepository } from './infrastructure/assets.repository';
import { OutboxRepository } from './infrastructure/outbox.repository';
import { TagsRepository } from './infrastructure/tags.repository';

export interface InitiateUploadInput {
  title: string;
  tags: string[];
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

export interface PresignedPart {
  partNumber: number;
  url: string;
  expiresAt: number;
}

export interface InitiatedUpload {
  assetId: string;
  versionId: string;
  partSizeBytes: number;
  parts: PresignedPart[];
}

/**
 * Upload lifecycle of asset versions (UPLOADING -> UPLOADED). File bytes go from
 * the client straight to object storage; this service only plans the upload,
 * signs part URLs and records the result.
 *
 * There is no transaction spanning object storage and the database, so every step
 * is ordered and idempotent: a retried call after a timeout either finishes the
 * missing half or returns the already-finished result.
 */
@Injectable()
export class UploadService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(uploadConfig.KEY) private readonly config: ConfigType<typeof uploadConfig>,
    private readonly assetsRepository: AssetsRepository,
    private readonly assetVersionsRepository: AssetVersionsRepository,
    private readonly tagsRepository: TagsRepository,
    private readonly outboxRepository: OutboxRepository,
    private readonly assetViewsRepository: AssetViewsRepository,
  ) {}

  /**
   * Storage first, then the database: if the INSERT fails, an orphaned multipart
   * upload is left in storage — invisible and removed by the bucket's
   * incomplete-upload lifecycle rule. The reverse order could leave a database row
   * pointing at an upload that never existed.
   */
  async initiate(input: InitiateUploadInput): Promise<InitiatedUpload> {
    const title = this.validateTitle(input.title);
    const tagNames = normalizeTagNames(input.tags);
    this.validateFile(input);

    const partSizeBytes = this.config.partSizeBytes;
    const assetId = uuidv7();
    const versionId = uuidv7();
    const originalKey = originalObjectKey(assetId, versionId);
    const now = Date.now();

    const uploadId = await this.storage.createMultipartUpload(originalKey, input.contentType);

    await this.db.transaction(async (tx) => {
      await this.assetsRepository.create({ id: assetId, title, createdAt: now }, tx);
      await this.assetVersionsRepository.createUploading(
        {
          id: versionId,
          assetId,
          number: 1,
          originalKey,
          originalFileName: input.fileName,
          sizeBytes: input.sizeBytes,
          contentType: input.contentType,
          uploadId,
          partSizeBytes,
          createdAt: now,
        },
        tx,
      );
      await this.tagsRepository.linkToAsset(assetId, tagNames, tx);
    });

    const partNumbers = resolvePartNumbers([], countParts(input.sizeBytes, partSizeBytes));

    return {
      assetId,
      versionId,
      partSizeBytes,
      parts: await this.signParts(originalKey, uploadId, partNumbers),
    };
  }

  /** Fresh URLs for resuming an interrupted upload or replacing expired ones. */
  async getPartUrls(versionId: string, requestedPartNumbers: number[]): Promise<PresignedPart[]> {
    const upload = await this.requireUploading(versionId);
    const partNumbers = resolvePartNumbers(
      requestedPartNumbers,
      countParts(upload.sizeBytes, upload.partSizeBytes),
    );

    return this.signParts(upload.originalKey, this.requireUploadId(upload), partNumbers);
  }

  async complete(versionId: string, parts: UploadedPart[]): Promise<Asset> {
    const upload = await this.requireUpload(versionId);

    // Already completed by an earlier (e.g. timed-out and retried) call: same result.
    if (upload.status !== AssetVersionStatus.UPLOADING) {
      return this.requireAssetView(upload.assetId);
    }

    const sortedParts = validateCompletedParts(
      parts,
      countParts(upload.sizeBytes, upload.partSizeBytes),
    );

    try {
      await this.storage.completeMultipartUpload(
        upload.originalKey,
        this.requireUploadId(upload),
        sortedParts,
      );
    } catch (error) {
      if (error instanceof StoragePartsRejectedException) {
        throw new InvalidUploadRequestException(
          'Object storage rejected the parts (missing part or wrong ETag)',
        );
      }

      // Storage finished earlier but our database update didn't: verified below via HEAD.
      if (!(error instanceof StorageUploadNotFoundException)) {
        throw error;
      }
    }

    await this.verifyStoredOriginal(upload);

    const now = Date.now();

    await this.db.transaction(async (tx) => {
      const transitioned = await this.assetVersionsRepository.markUploaded(versionId, now, tx);

      // Only the call that performed the transition records the event (exactly once).
      if (!transitioned) {
        return;
      }

      await this.assetsRepository.touch(upload.assetId, now, tx);
      await this.outboxRepository.append(
        {
          eventId: uuidv7(),
          topic: ASSET_EVENTS_TOPIC,
          key: upload.assetId,
          type: ASSET_UPLOADED_EVENT,
          payload: {
            assetId: upload.assetId,
            assetVersionId: upload.versionId,
            versionNumber: upload.number,
            originalKey: upload.originalKey,
            sizeBytes: upload.sizeBytes,
          },
          occurredAt: now,
        },
        tx,
      );
    });

    return this.requireAssetView(upload.assetId);
  }

  /** Idempotent: aborting an unknown or already aborted upload succeeds. */
  async abort(versionId: string): Promise<void> {
    const upload = await this.assetVersionsRepository.findUploadById(versionId);

    if (!upload) {
      return;
    }

    if (upload.status !== AssetVersionStatus.UPLOADING) {
      throw new UploadNotInProgressException(`Version ${versionId} is no longer uploading`);
    }

    if (upload.uploadId) {
      await this.storage.abortMultipartUpload(upload.originalKey, upload.uploadId);
    }

    await this.db.transaction(async (tx) => {
      // A first version means the asset itself was never published: remove it entirely.
      if (upload.number === 1) {
        await this.assetsRepository.deleteById(upload.assetId, tx);
      } else {
        await this.assetVersionsRepository.deleteById(versionId, tx);
      }
    });
  }

  private async signParts(
    key: string,
    uploadId: string,
    partNumbers: number[],
  ): Promise<PresignedPart[]> {
    const ttlSeconds = this.config.urlTtlSeconds;
    const expiresAt = Date.now() + ttlSeconds * 1000;

    // Signing is local HMAC work (no network), so signing all parts at once is fine.
    return Promise.all(
      partNumbers.map(async (partNumber) => ({
        partNumber,
        url: await this.storage.presignUploadPart(key, uploadId, partNumber, ttlSeconds),
        expiresAt,
      })),
    );
  }

  /** The assembled object must match what the client declared before uploading. */
  private async verifyStoredOriginal(upload: VersionUpload): Promise<void> {
    const stored = await this.storage.headObject(upload.originalKey);

    if (!stored) {
      throw new UploadNotInProgressException(
        `Upload of version ${upload.versionId} no longer exists (aborted or expired)`,
      );
    }

    if (stored.sizeBytes !== upload.sizeBytes) {
      throw new InvalidUploadRequestException(
        `Uploaded ${String(stored.sizeBytes)} bytes, declared ${String(upload.sizeBytes)}`,
      );
    }
  }

  private validateTitle(rawTitle: string): string {
    const title = rawTitle.trim();

    if (title.length === 0 || title.length > MAX_TITLE_LENGTH) {
      throw new InvalidUploadRequestException(
        `Title must have 1-${String(MAX_TITLE_LENGTH)} characters`,
      );
    }

    return title;
  }

  private validateFile(input: InitiateUploadInput): void {
    if (input.contentType !== GLB_CONTENT_TYPE) {
      throw new InvalidUploadRequestException(`Only ${GLB_CONTENT_TYPE} (.glb) is accepted`);
    }

    if (!input.fileName.toLowerCase().endsWith(GLB_EXTENSION)) {
      throw new InvalidUploadRequestException(`File name must end with ${GLB_EXTENSION}`);
    }

    if (
      !Number.isSafeInteger(input.sizeBytes) ||
      input.sizeBytes < 1 ||
      input.sizeBytes > this.config.maxSizeBytes
    ) {
      throw new InvalidUploadRequestException(
        `File size must be between 1 and ${String(this.config.maxSizeBytes)} bytes`,
      );
    }

    if (countParts(input.sizeBytes, this.config.partSizeBytes) > MAX_UPLOAD_PARTS) {
      throw new InvalidUploadRequestException('File needs more parts than object storage allows');
    }
  }

  private async requireUpload(versionId: string): Promise<VersionUpload> {
    const upload = await this.assetVersionsRepository.findUploadById(versionId);

    if (!upload) {
      throw new AssetVersionNotFoundException(`Asset version ${versionId} not found`);
    }

    return upload;
  }

  private async requireUploading(versionId: string): Promise<VersionUpload> {
    const upload = await this.requireUpload(versionId);

    if (upload.status !== AssetVersionStatus.UPLOADING) {
      throw new UploadNotInProgressException(`Version ${versionId} is no longer uploading`);
    }

    return upload;
  }

  private requireUploadId(upload: VersionUpload): string {
    if (!upload.uploadId) {
      throw new UploadNotInProgressException(`Version ${upload.versionId} has no active upload`);
    }

    return upload.uploadId;
  }

  private async requireAssetView(assetId: string): Promise<Asset> {
    const [asset] = await this.assetViewsRepository.findByIds([assetId]);

    if (!asset) {
      throw new AssetVersionNotFoundException(`Asset ${assetId} not found`);
    }

    return asset;
  }
}
