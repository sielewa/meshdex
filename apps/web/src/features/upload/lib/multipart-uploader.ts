import { GraphqlRequestError } from '@/graphql/graphql-request-error';
import { GRAPHQL_ERROR_CODES } from '@/graphql/graphql.constants';
import { PartUploadError } from '@/features/upload/api/part-upload-error';
import type { putPart } from '@/features/upload/api/put-part';
import { runWithConcurrency } from '@/features/upload/lib/run-with-concurrency';
import type { PartUrl, UploadApi } from '@/features/upload/types/upload-api';
import type { UploadProgress } from '@/features/upload/types/upload-progress';
import type { UploadSession } from '@/features/upload/lib/upload-session.schema';
import type { UploadSessionStore } from '@/features/upload/lib/upload-session-store';
import {
  PART_MAX_ATTEMPTS,
  PART_RETRY_BASE_DELAY_MS,
  PART_UPLOAD_CONCURRENCY,
  PART_URL_RENEW_MARGIN_MS,
} from '@/features/upload/upload.constants';

const GLB_CONTENT_TYPE = 'model/gltf-binary';

interface Dependencies {
  api: UploadApi;
  store: UploadSessionStore;
  putPart: typeof putPart;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

/**
 * Uploads a file straight to object storage in presigned parts (architecture.md, upload
 * flow): the gateway only hands out URLs and completes the upload.
 *
 * - Parts run through a bounded pool (`PART_UPLOAD_CONCURRENCY`), read lazily from disk.
 * - A part that fails transiently is retried with exponential backoff and jitter; one whose
 *   URL expired gets a fresh URL first.
 * - Every stored part is recorded with its ETag, so an interrupted upload (closed tab, lost
 *   network) resumes with only the missing parts when the same file is picked again.
 * - Cancelling aborts the upload on the server and forgets the session.
 */
export class MultipartUploader {
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;

  constructor(private readonly deps: Dependencies) {
    this.sleep = deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.random = deps.random ?? Math.random;
  }

  async upload(
    request: { file: File; title: string; tags: string[] },
    options: { signal: AbortSignal; onProgress: (progress: UploadProgress) => void },
  ): Promise<{ assetId: string }> {
    const { file } = request;
    const urls = new Map<number, PartUrl>();
    const resumable = await this.resume(file, urls);
    const session = resumable ?? (await this.start(request, urls));
    const inFlightBytes = new Map<number, number>();

    const report = (): void => {
      const storedBytes = session.completedParts.reduce(
        (sum, part) => sum + this.partSize(session, file, part.partNumber),
        0,
      );
      let inFlight = 0;

      for (const bytes of inFlightBytes.values()) {
        inFlight += bytes;
      }

      options.onProgress({
        uploadedBytes: storedBytes + inFlight,
        totalBytes: file.size,
        completedParts: session.completedParts.length,
        partCount: session.partCount,
        resumed: resumable !== null,
      });
    };

    try {
      report();
      await runWithConcurrency(
        this.missingParts(session),
        PART_UPLOAD_CONCURRENCY,
        async (partNumber) => {
          const etag = await this.uploadPart(session, file, partNumber, urls, {
            signal: options.signal,
            onProgress: (bytes) => {
              inFlightBytes.set(partNumber, bytes);
              report();
            },
          });

          inFlightBytes.delete(partNumber);
          session.completedParts.push({
            partNumber,
            etag,
          });
          this.deps.store.save(file, session);
          report();
        },
        options.signal,
      );
      await this.deps.api.complete(session.assetVersionId, session.completedParts);
    } catch (error) {
      if (options.signal.aborted) {
        await this.cancel(file, session);
      }

      // Anything else keeps the session: picking the same file again resumes the upload.
      throw error;
    }

    this.deps.store.remove(file);

    return { assetId: session.assetId };
  }

  /**
   * Picks up a stored session and signs fresh URLs for its missing parts. A session the
   * server no longer knows (aborted, completed, cleaned up) is dropped, and the upload
   * starts over.
   */
  private async resume(file: File, urls: Map<number, PartUrl>): Promise<UploadSession | null> {
    const session = this.deps.store.load(file);

    if (!session) {
      return null;
    }

    const missing = this.missingParts(session);

    if (missing.length === 0) {
      return session;
    }

    try {
      for (const url of await this.deps.api.renewPartUrls(session.assetVersionId, missing)) {
        urls.set(url.partNumber, url);
      }

      return session;
    } catch (error) {
      if (
        error instanceof GraphqlRequestError &&
        (error.hasCode(GRAPHQL_ERROR_CODES.NOT_FOUND) ||
          error.hasCode(GRAPHQL_ERROR_CODES.CONFLICT))
      ) {
        this.deps.store.remove(file);

        return null;
      }

      throw error;
    }
  }

  private async start(
    request: { file: File; title: string; tags: string[] },
    urls: Map<number, PartUrl>,
  ): Promise<UploadSession> {
    const initiated = await this.deps.api.initiate({
      title: request.title,
      tags: request.tags,
      fileName: request.file.name,
      contentType: GLB_CONTENT_TYPE,
      sizeBytes: request.file.size,
    });
    const session: UploadSession = {
      version: 1,
      assetId: initiated.assetId,
      assetVersionId: initiated.assetVersionId,
      partSizeBytes: initiated.partSizeBytes,
      partCount: initiated.parts.length,
      completedParts: [],
      createdAt: Date.now(),
    };

    for (const url of initiated.parts) {
      urls.set(url.partNumber, url);
    }
    this.deps.store.save(request.file, session);

    return session;
  }

  /** One part with its own retry loop; returns the ETag storage assigned to it. */
  private async uploadPart(
    session: UploadSession,
    file: File,
    partNumber: number,
    urls: Map<number, PartUrl>,
    options: { signal: AbortSignal; onProgress: (bytes: number) => void },
  ): Promise<string> {
    const start = (partNumber - 1) * session.partSizeBytes;
    const body = file.slice(start, start + session.partSizeBytes);

    for (let attempt = 1; ; attempt += 1) {
      const url = await this.usableUrl(session, partNumber, urls);

      try {
        return await this.deps.putPart({
          url: url.url,
          body,
          signal: options.signal,
          onProgress: options.onProgress,
        });
      } catch (error) {
        options.onProgress(0);

        if (
          options.signal.aborted ||
          !(error instanceof PartUploadError) ||
          attempt >= PART_MAX_ATTEMPTS
        ) {
          throw error;
        }

        if (error.isSignatureRejected) {
          urls.delete(partNumber);
        } else if (error.isTransient) {
          await this.sleep(this.backoff(attempt));
        } else {
          throw error;
        }
      }
    }
  }

  /** The part's URL, renewed first when missing or about to expire (saves a 403 round trip). */
  private async usableUrl(
    session: UploadSession,
    partNumber: number,
    urls: Map<number, PartUrl>,
  ): Promise<PartUrl> {
    const current = urls.get(partNumber);

    if (current && Date.parse(current.expiresAt) - Date.now() > PART_URL_RENEW_MARGIN_MS) {
      return current;
    }

    const [renewed] = await this.deps.api.renewPartUrls(session.assetVersionId, [partNumber]);

    if (!renewed) {
      throw new Error(`Gateway returned no URL for part ${String(partNumber)}`);
    }
    urls.set(partNumber, renewed);

    return renewed;
  }

  /**
   * "Full jitter": a random delay up to an exponentially growing cap, so parts (and other
   * clients) that failed together don't retry together.
   */
  private backoff(attempt: number): number {
    return Math.round(this.random() * PART_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
  }

  /** Best effort: the upload is cancelled locally even if the server can't be told. */
  private async cancel(file: File, session: UploadSession): Promise<void> {
    this.deps.store.remove(file);

    try {
      await this.deps.api.abort(session.assetVersionId);
    } catch {
      // Unfinished uploads are also cleaned up by the stale-uploads reconciler (roadmap).
    }
  }

  private missingParts(session: UploadSession): number[] {
    const done = new Set(session.completedParts.map((part) => part.partNumber));

    return Array.from({ length: session.partCount }, (_, index) => index + 1).filter(
      (partNumber) => !done.has(partNumber),
    );
  }

  private partSize(session: UploadSession, file: File, partNumber: number): number {
    const start = (partNumber - 1) * session.partSizeBytes;

    return Math.min(session.partSizeBytes, file.size - start);
  }
}
