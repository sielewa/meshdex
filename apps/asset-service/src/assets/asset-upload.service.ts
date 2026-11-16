import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { validate as isUuid, v7 as uuidv7 } from 'uuid';
import { uploadConfig } from '../config/config.namespaces';
import { DATABASE } from '../database/database.tokens';
import type { Database } from '../database/domain/database.type';
import { OBJECT_STORAGE } from '../storage/storage.tokens';
import { StoragePartsRejectedException } from '../storage/exceptions/storage-parts-rejected.exception';
import { StorageUploadNotFoundException } from '../storage/exceptions/storage-upload-not-found.exception';
import type { ObjectStorage } from '../storage/domain/object-storage-port.interface';
import type { UploadedPart } from '../storage/domain/uploaded-part.interface';
import {
  ASSET_EVENTS_TOPIC,
  ASSET_UPLOADED_EVENT,
  GLB_CONTENT_TYPE,
  GLB_EXTENSION,
  MAX_SOURCE_PREVIEW_SIZE_BYTES,
  MAX_TAG_LENGTH,
  MAX_TAGS_PER_ASSET,
  MAX_TITLE_LENGTH,
  MAX_UPLOAD_PARTS,
  SOURCE_PREVIEW_EXTENSIONS,
} from './assets.constants';
import type { Asset } from './domain/asset.interface';
import { AssetVersionStatus } from './domain/asset-version-status.enum';
import type { VersionUpload } from './domain/version-upload.interface';
import { AssetVersionNotFoundException } from './exceptions/asset-version-not-found.exception';
import { InvalidAssetVersionIdException } from './exceptions/invalid-asset-version-id.exception';
import { InvalidUploadRequestException } from './exceptions/invalid-upload-request.exception';
import { SourcePreviewMissingException } from './exceptions/source-preview-missing.exception';
import { UploadNotInProgressException } from './exceptions/upload-not-in-progress.exception';
import { CatalogService } from '../catalog/catalog.service';
import { AssetVersionsRepository } from './infrastructure/asset-versions.repository';
import { AssetsRepository } from './infrastructure/assets.repository';
import { OutboxRepository } from './infrastructure/outbox.repository';
import { TagsRepository } from './infrastructure/tags.repository';
import type { InitiateUploadInput } from './domain/initiate-upload-input.interface';
import type { InitiatedUpload } from './domain/initiated-upload.interface';
import type { ImageUpload } from './domain/image-upload.interface';
import type { PresignedPart } from './domain/presigned-part.interface';
import type { PresignedUrl } from './domain/presigned-url.interface';
import type { StoredObject } from './domain/stored-object.interface';

/**
 * No transaction spans object storage and the database, so every step is ordered and
 * idempotent: a retry either finishes the missing half or returns the finished result.
 */
@Injectable()
export class AssetUploadService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(uploadConfig.KEY) private readonly config: ConfigType<typeof uploadConfig>,
    private readonly assetsRepository: AssetsRepository,
    private readonly assetVersionsRepository: AssetVersionsRepository,
    private readonly tagsRepository: TagsRepository,
    private readonly outboxRepository: OutboxRepository,
    private readonly catalogService: CatalogService,
  ) {}

  /**
   * Storage first: a failed INSERT leaves an invisible orphan upload (cleaned by a lifecycle rule),
   * while the reverse order could leave a row pointing at an upload that never existed.
   */
  async initiate(input: InitiateUploadInput): Promise<InitiatedUpload> {
    const title = this.validateTitle(input.title);
    const tagNames = this.normalizeTagNames(input.tags);
    this.validateFile(input);
    this.validateSourcePreview(input.sourcePreview);

    const partSizeBytes = this.config.partSizeBytes;
    const assetId = uuidv7();
    const versionId = uuidv7();
    const originalKey = this.originalObjectKey(assetId, versionId);
    const sourcePreview = input.sourcePreview && {
      key: this.sourcePreviewKey(assetId, versionId, input.sourcePreview.contentType),
      sizeBytes: input.sourcePreview.sizeBytes,
      contentType: input.sourcePreview.contentType,
    };
    const now = Date.now();

    const uploadId = await this.storage.createMultipartUpload(originalKey, input.contentType);

    await this.db.transaction(async (tx) => {
      await this.assetsRepository.create(
        {
          id: assetId,
          title,
          createdAt: now,
        },
        tx,
      );
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
          sourcePreview,
        },
        tx,
      );
      await this.tagsRepository.linkToAsset(assetId, tagNames, tx);
    });

    const partNumbers = this.resolvePartNumbers(
      [],
      this.countParts(input.sizeBytes, partSizeBytes),
    );

    return {
      assetId,
      versionId,
      partSizeBytes,
      parts: await this.signParts(originalKey, uploadId, partNumbers),
      sourcePreviewUpload: sourcePreview && (await this.signSourcePreview(sourcePreview)),
    };
  }

  async getPartUrls(versionId: string, requestedPartNumbers: number[]): Promise<PresignedPart[]> {
    this.assertVersionId(versionId);
    const upload = await this.requireUploading(versionId);
    const partNumbers = this.resolvePartNumbers(
      requestedPartNumbers,
      this.countParts(upload.sizeBytes, upload.partSizeBytes),
    );

    return this.signParts(upload.originalKey, this.requireUploadId(upload), partNumbers);
  }

  async complete(versionId: string, parts: UploadedPart[]): Promise<Asset> {
    this.assertVersionId(versionId);
    const upload = await this.requireUpload(versionId);

    // Already completed by an earlier (e.g. timed-out and retried) call: same result.
    if (upload.status !== AssetVersionStatus.UPLOADING) {
      return this.requireAssetView(upload.assetId);
    }

    const sortedParts = this.validateCompletedParts(
      parts,
      this.countParts(upload.sizeBytes, upload.partSizeBytes),
    );

    // Before assembling, which can't be undone: the client can still upload the image and retry.
    if (upload.sourcePreview) {
      await this.verifyStoredSourcePreview(upload.versionId, upload.sourcePreview);
    }

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
    this.assertVersionId(versionId);
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

    // The image sits under the public prefix: left behind, it would stay readable.
    if (upload.sourcePreview) {
      await this.storage.deleteObject(upload.sourcePreview.key);
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

    return Promise.all(
      partNumbers.map(async (partNumber) => ({
        partNumber,
        url: await this.storage.presignUploadPart(key, uploadId, partNumber, ttlSeconds),
        expiresAt,
      })),
    );
  }

  private async signSourcePreview(sourcePreview: StoredObject): Promise<PresignedUrl> {
    const ttlSeconds = this.config.urlTtlSeconds;

    return {
      url: await this.storage.presignPut(sourcePreview.key, sourcePreview.contentType, ttlSeconds),
      expiresAt: Date.now() + ttlSeconds * 1000,
    };
  }

  /** The image must be stored as declared; its Content-Type was fixed by the signed URL. */
  private async verifyStoredSourcePreview(
    versionId: string,
    sourcePreview: StoredObject,
  ): Promise<void> {
    const stored = await this.storage.headObject(sourcePreview.key);

    if (!stored) {
      throw new SourcePreviewMissingException(
        `Source preview of version ${versionId} has not been uploaded`,
      );
    }

    if (stored.sizeBytes !== sourcePreview.sizeBytes) {
      throw new InvalidUploadRequestException(
        `Source preview has ${String(stored.sizeBytes)} bytes, declared ${String(sourcePreview.sizeBytes)}`,
      );
    }
  }

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

    if (this.countParts(input.sizeBytes, this.config.partSizeBytes) > MAX_UPLOAD_PARTS) {
      throw new InvalidUploadRequestException('File needs more parts than object storage allows');
    }
  }

  private validateSourcePreview(sourcePreview: ImageUpload | null): void {
    if (!sourcePreview) {
      return;
    }

    // hasOwn, not `in`: "constructor" or "toString" must not pass as an image type.
    if (!Object.hasOwn(SOURCE_PREVIEW_EXTENSIONS, sourcePreview.contentType)) {
      throw new InvalidUploadRequestException(
        `Source preview must be one of ${Object.keys(SOURCE_PREVIEW_EXTENSIONS).join(', ')}`,
      );
    }

    if (
      !Number.isSafeInteger(sourcePreview.sizeBytes) ||
      sourcePreview.sizeBytes < 1 ||
      sourcePreview.sizeBytes > MAX_SOURCE_PREVIEW_SIZE_BYTES
    ) {
      throw new InvalidUploadRequestException(
        `Source preview size must be between 1 and ${String(MAX_SOURCE_PREVIEW_SIZE_BYTES)} bytes`,
      );
    }
  }

  private assertVersionId(versionId: string): void {
    if (!isUuid(versionId)) {
      throw new InvalidAssetVersionIdException(`Asset version id ${versionId} is not a UUID`);
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

  private requireAssetView(assetId: string): Promise<Asset> {
    return this.catalogService.getAsset(assetId);
  }

  /** "Wooden  Chair" -> "wooden-chair"; the `tags_name_normalized` check enforces the same rule. */
  private normalizeTagNames(rawNames: string[]): string[] {
    const names: string[] = [];

    for (const raw of rawNames) {
      const name = raw.trim().toLowerCase().replace(/\s+/g, '-');

      if (name.length === 0 || names.includes(name)) {
        continue;
      }

      if (name.length > MAX_TAG_LENGTH) {
        throw new InvalidUploadRequestException(
          `Tag "${name.slice(0, 20)}…" is longer than ${String(MAX_TAG_LENGTH)} characters`,
        );
      }

      names.push(name);
    }

    if (names.length > MAX_TAGS_PER_ASSET) {
      throw new InvalidUploadRequestException(
        `At most ${String(MAX_TAGS_PER_ASSET)} tags per asset`,
      );
    }

    return names;
  }

  private countParts(sizeBytes: number, partSizeBytes: number): number {
    return Math.ceil(sizeBytes / partSizeBytes);
  }

  private originalObjectKey(assetId: string, versionId: string): string {
    return `originals/${assetId}/${versionId}.glb`;
  }

  /** Under `public/`, the one prefix readable without credentials (ADR 017). */
  private sourcePreviewKey(assetId: string, versionId: string, contentType: string): string {
    return `public/previews/${assetId}/${versionId}.${SOURCE_PREVIEW_EXTENSIONS[contentType] ?? 'bin'}`;
  }

  /** CompleteMultipartUpload requires every part once, in ascending order. */
  private validateCompletedParts(parts: UploadedPart[], partCount: number): UploadedPart[] {
    const sorted = [...parts].sort((left, right) => left.partNumber - right.partNumber);
    const complete =
      sorted.length === partCount &&
      sorted.every((part, index) => part.partNumber === index + 1 && part.etag.length > 0);

    if (!complete) {
      throw new InvalidUploadRequestException(
        `Expected parts 1..${String(partCount)} each with an ETag, got ${String(parts.length)}`,
      );
    }

    return sorted;
  }

  private resolvePartNumbers(requested: number[], partCount: number): number[] {
    if (requested.length === 0) {
      return Array.from({ length: partCount }, (_, index) => index + 1);
    }

    const invalid = requested.find(
      (partNumber) => !Number.isInteger(partNumber) || partNumber < 1 || partNumber > partCount,
    );

    if (invalid !== undefined) {
      throw new InvalidUploadRequestException(
        `Part number ${String(invalid)} is outside 1..${String(partCount)}`,
      );
    }

    return [...new Set(requested)];
  }
}
