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
import { TaskRunnerService } from '../tasks/task-runner.service';
import type { GlbUpload } from './domain/glb-upload.interface';
import type { UploadedAsset } from './domain/uploaded-asset.interface';
import {
  GLB_CONTENT_TYPE,
  PART_RETRY_ATTEMPTS,
  PART_RETRY_BASE_DELAY_MS,
  PART_RETRY_MAX_DELAY_MS,
} from './import.constants';

/**
 * Turns a packed GLB into an asset through the same upload flow as the browser
 * (architecture.md): `InitiateUpload` → parts PUT to presigned URLs → `CompleteUpload`.
 *
 * Parts of one model go one after another, each a zero-copy `subarray` of the GLB: the
 * pipeline already runs several models at once, so per-model part concurrency would only
 * multiply open connections. A part is retried on transient errors; on a 403 (expired URL)
 * it is signed again first. When anything fails after `InitiateUpload`, the upload is
 * aborted, so no half-uploaded asset stays behind.
 *
 * `InitiateUpload` itself is never retried: it creates an asset each time, so a retry after
 * a lost response would create a duplicate. The model is reported as failed and a re-run
 * picks it up.
 */
@Injectable()
export class ModelUploaderService {
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
    private readonly tasks: TaskRunnerService,
    @InjectPinoLogger(ModelUploaderService.name)
    private readonly logger: PinoLogger,
  ) {}

  async upload(upload: GlbUpload, signal: AbortSignal): Promise<UploadedAsset> {
    const session = await this.assetService.initiateUpload({
      title: upload.title,
      tags: upload.tags,
      fileName: upload.fileName,
      contentType: GLB_CONTENT_TYPE,
      sizeBytes: upload.glb.byteLength,
    });

    try {
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

  /** One attempt; a rejected signature drops the URL, so the next attempt signs a new one. */
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

  /**
   * Best effort: the run goes on (or stops) either way. An upload left behind is also
   * cleaned up by the stale-uploads reconciler (roadmap).
   */
  private async abortQuietly(assetVersionId: string): Promise<void> {
    try {
      await this.assetService.abortUpload(assetVersionId);
    } catch (error) {
      this.logger.warn({ assetVersionId, err: error }, 'Could not abort a failed upload');
    }
  }
}
