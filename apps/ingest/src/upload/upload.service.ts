import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { ASSET_SERVICE } from '../clients/asset-service/asset-service.tokens';
import type { AssetServicePort } from '../clients/asset-service/domain/asset-service-port.interface';
import type { CompletedPart } from '../clients/asset-service/domain/completed-part.interface';
import type { UploadSession } from '../clients/asset-service/domain/upload-session.interface';
import type { PresignedUploadPort } from '../clients/object-storage/domain/presigned-upload-port.interface';
import { PartUploadException } from '../clients/object-storage/exceptions/part-upload.exception';
import { PRESIGNED_UPLOAD } from '../clients/object-storage/object-storage.tokens';
import type { RetryPolicy } from '../tasks/domain/retry-policy.interface';
import { TasksService } from '../tasks/tasks.service';
import type { GlbUpload } from './domain/glb-upload.interface';
import type { UploadedAsset } from './domain/uploaded-asset.interface';
import {
  GLB_CONTENT_TYPE,
  PART_RETRY_ATTEMPTS,
  PART_RETRY_BASE_DELAY_MS,
  PART_RETRY_MAX_DELAY_MS,
} from './upload.constants';

/**
 * The browser's upload flow. Parts of one model go one after another: the pipeline already runs
 * several models at once, so per-model concurrency would only multiply connections. Anything
 * failing after `InitiateUpload` aborts the upload.
 */
@Injectable()
export class UploadService {
  private readonly partRetryPolicy: RetryPolicy = {
    attempts: PART_RETRY_ATTEMPTS,
    baseDelayMs: PART_RETRY_BASE_DELAY_MS,
    maxDelayMs: PART_RETRY_MAX_DELAY_MS,
    isRetryable: (error) =>
      error instanceof PartUploadException && (error.isTransient || error.isSignatureRejected),
  };

  constructor(
    @Inject(ASSET_SERVICE)
    private readonly assetService: AssetServicePort,
    @Inject(PRESIGNED_UPLOAD)
    private readonly storage: PresignedUploadPort,
    private readonly tasks: TasksService,
    @InjectPinoLogger(UploadService.name)
    private readonly logger: PinoLogger,
  ) {}

  /** The preview's URL can't be signed again (ADR 017): an expired one fails the model. */
  private readonly previewRetryPolicy: RetryPolicy = {
    ...this.partRetryPolicy,
    isRetryable: (error) => error instanceof PartUploadException && error.isTransient,
  };

  async upload(upload: GlbUpload, signal: AbortSignal): Promise<UploadedAsset> {
    const { sourcePreview } = upload;
    const session = await this.assetService.initiateUpload({
      title: upload.title,
      tags: upload.tags,
      fileName: upload.fileName,
      contentType: GLB_CONTENT_TYPE,
      sizeBytes: upload.glb.byteLength,
      sourcePreview: sourcePreview && {
        contentType: sourcePreview.contentType,
        sizeBytes: sourcePreview.bytes.byteLength,
      },
    });

    try {
      if (sourcePreview) {
        const url = session.sourcePreviewUploadUrl;

        if (url === null) {
          throw new Error('asset-service signed no URL for the declared source preview');
        }

        await this.tasks.retry(
          () => this.storage.putObject(url, sourcePreview.bytes, sourcePreview.contentType, signal),
          this.previewRetryPolicy,
          signal,
        );
      }

      const parts = await this.uploadParts(session, upload.glb, signal);

      await this.assetService.completeUpload(session.assetVersionId, parts);
    } catch (error) {
      await this.abortQuietly(session.assetVersionId);
      throw error;
    }

    return {
      assetId: session.assetId,
      assetVersionId: session.assetVersionId,
    };
  }

  private async uploadParts(
    session: UploadSession,
    glb: Uint8Array,
    signal: AbortSignal,
  ): Promise<CompletedPart[]> {
    const partCount = Math.ceil(glb.byteLength / session.partSizeBytes);
    const urls = new Map(session.parts.map((part) => [part.partNumber, part.url]));

    if (session.parts.length !== partCount || urls.size !== partCount) {
      throw new Error(
        `asset-service signed ${String(session.parts.length)} parts, expected ${String(partCount)}`,
      );
    }

    const completed: CompletedPart[] = [];

    for (let partNumber = 1; partNumber <= partCount; partNumber += 1) {
      const start = (partNumber - 1) * session.partSizeBytes;
      const body = glb.subarray(start, start + session.partSizeBytes);
      const etag = await this.tasks.retry(
        () => this.putPart(session.assetVersionId, partNumber, body, urls, signal),
        this.partRetryPolicy,
        signal,
      );

      completed.push({
        partNumber,
        etag,
      });
    }

    return completed;
  }

  /** A rejected signature drops the URL, so the next attempt signs a new one. */
  private async putPart(
    assetVersionId: string,
    partNumber: number,
    body: Uint8Array,
    urls: Map<number, string>,
    signal: AbortSignal,
  ): Promise<string> {
    let url = urls.get(partNumber);

    if (url === undefined) {
      const [renewed] = await this.assetService.getUploadPartUrls(assetVersionId, [partNumber]);

      if (renewed === undefined) {
        throw new Error(`asset-service returned no URL for part ${String(partNumber)}`);
      }

      url = renewed.url;
      urls.set(partNumber, url);
    }

    try {
      return await this.storage.putPart(url, body, signal);
    } catch (error) {
      if (error instanceof PartUploadException && error.isSignatureRejected) {
        urls.delete(partNumber);
      }

      throw error;
    }
  }

  /** Best effort: a leftover upload is the stale-uploads reconciler's job (roadmap). */
  private async abortQuietly(assetVersionId: string): Promise<void> {
    try {
      await this.assetService.abortUpload(assetVersionId);
    } catch (error) {
      this.logger.warn({ assetVersionId, err: error }, 'Could not abort a failed upload');
    }
  }
}
