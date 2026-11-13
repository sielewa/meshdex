import { performance } from 'node:perf_hooks';
import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { MAX_PREVIEW_SIZE_BYTES, PREVIEW_FILE_NAME } from '../cache/cache.constants';
import type { CachedFile } from '../cache/domain/cached-file.interface';
import type { CachedModelManifest } from '../cache/domain/cached-model-manifest.interface';
import type { CachedPreview } from '../cache/domain/cached-preview.interface';
import { UnsafeCachePathException } from '../cache/exceptions/unsafe-cache-path.exception';
import { CacheService } from '../cache/cache.service';
import type { PolyhavenModel } from '../clients/polyhaven/domain/polyhaven-model.interface';
import type { PolyhavenPort } from '../clients/polyhaven/domain/polyhaven-port.interface';
import type { RemoteFile } from '../clients/polyhaven/domain/remote-file.interface';
import type { TextureResolution } from '../clients/polyhaven/domain/texture-resolution.type';
import { PolyhavenRequestException } from '../clients/polyhaven/exceptions/polyhaven-request.exception';
import { POLYHAVEN_PREVIEW_CONTENT_TYPE } from '../clients/polyhaven/polyhaven.constants';
import { POLYHAVEN } from '../clients/polyhaven/polyhaven.tokens';
import type { RetryPolicy } from '../tasks/domain/retry-policy.interface';
import { TasksService } from '../tasks/tasks.service';
import type { FetchSummary } from './domain/fetch-summary.interface';
import type { ModelFetchResult } from './domain/model-fetch-result.interface';
import type { FetchArgs } from './dto/fetch.args';
import {
  FETCH_RETRY_ATTEMPTS,
  FETCH_RETRY_BASE_DELAY_MS,
  FETCH_RETRY_MAX_DELAY_MS,
} from './fetch.constants';

/**
 * `ingest fetch`: downloads models' glTF files from Poly Haven into the local cache (ADR 013).
 *
 * Concurrency is across models: up to `concurrency` models are in flight, each downloading
 * its files one after another, so at most `concurrency` downloads run at once. A re-run skips
 * models whose cached manifest matches the catalog's `files_hash` (no request at all) and
 * files already cached with the right MD5, so an interrupted fetch resumes where it stopped.
 * Each model's preview image (ADR 017) is kept up to date the same way, also for models whose
 * files are: a cache filled before previews existed gets them on the next run.
 */
@Injectable()
export class FetchService {
  /**
   * Network errors, timeouts, 429/5xx and truncated downloads are transient. Unsafe paths and
   * non-retryable API answers (404, malformed listings) fail at once.
   */
  private readonly retryPolicy: RetryPolicy = {
    attempts: FETCH_RETRY_ATTEMPTS,
    baseDelayMs: FETCH_RETRY_BASE_DELAY_MS,
    maxDelayMs: FETCH_RETRY_MAX_DELAY_MS,
    isRetryable: (error) =>
      !(error instanceof UnsafeCachePathException) &&
      !(error instanceof PolyhavenRequestException && !error.retryable),
  };

  constructor(
    @Inject(POLYHAVEN)
    private readonly polyhaven: PolyhavenPort,
    private readonly cache: CacheService,
    private readonly tasks: TasksService,
    @InjectPinoLogger(FetchService.name)
    private readonly logger: PinoLogger,
  ) {}

  async run(args: FetchArgs, signal: AbortSignal): Promise<FetchSummary> {
    const startedAt = performance.now();
    const catalog = await this.tasks.retry(
      () => this.polyhaven.listModels(signal),
      this.retryPolicy,
      signal,
    );
    const summary: FetchSummary = {
      modelsSelected: 0,
      modelsFetched: 0,
      modelsUpToDate: 0,
      modelsWithoutGltf: 0,
      failures: [],
      filesDownloaded: 0,
      bytesDownloaded: 0,
      durationMs: 0,
    };
    const models = this.select(catalog, args, summary);

    summary.modelsSelected = models.length;
    this.logger.info(
      {
        catalogSize: catalog.length,
        models: models.length,
        resolution: args.resolution,
        concurrency: args.concurrency,
      },
      'Fetch started',
    );

    await this.tasks.forEach(models, args.concurrency, async (model) => {
      try {
        const result = await this.fetchModel(model, args.resolution, signal);

        summary.filesDownloaded += result.filesDownloaded;
        summary.bytesDownloaded += result.bytesDownloaded;

        if (result.status === 'fetched') {
          summary.modelsFetched += 1;
        } else if (result.status === 'up-to-date') {
          summary.modelsUpToDate += 1;
        } else {
          summary.modelsWithoutGltf += 1;
        }
      } catch (error) {
        if (signal.aborted) {
          throw error;
        }

        const reason = error instanceof Error ? error.message : String(error);

        summary.failures.push({
          modelId: model.id,
          reason,
        });
        this.logger.warn({ modelId: model.id, err: error }, 'Model fetch failed');
      }
    });

    summary.durationMs = Math.round(performance.now() - startedAt);
    this.logger.info({ ...summary }, 'Fetch finished');

    return summary;
  }

  private async fetchModel(
    model: PolyhavenModel,
    resolution: TextureResolution,
    signal: AbortSignal,
  ): Promise<ModelFetchResult> {
    const modelDir = this.cache.modelDir(model.id, resolution);
    const cached = await this.cache.readManifest(model.id, resolution);

    if (
      cached !== null &&
      model.filesHash !== null &&
      cached.filesHash === model.filesHash &&
      (await this.allCached(modelDir, cached.files))
    ) {
      const preview = await this.syncPreview(model, modelDir, cached.preview ?? null, signal);

      if (!preview.downloaded) {
        return this.result('up-to-date', 0, 0);
      }

      await this.cache.writeManifest({
        ...cached,
        preview: preview.cached,
      });

      return this.result('fetched', 1, preview.cached?.sizeBytes ?? 0);
    }

    const fileSet = await this.tasks.retry(
      () => this.polyhaven.findGltfFiles(model.id, resolution, signal),
      this.retryPolicy,
      signal,
    );

    if (fileSet === null) {
      this.logger.debug({ modelId: model.id, resolution }, 'No glTF at this resolution');

      return this.result('no-gltf', 0, 0);
    }

    let filesDownloaded = 0;
    let bytesDownloaded = 0;

    for (const file of fileSet.files) {
      if (await this.downloadIfMissing(modelDir, file, signal)) {
        filesDownloaded += 1;
        bytesDownloaded += file.sizeBytes;
      }
    }

    const preview = await this.syncPreview(model, modelDir, cached?.preview ?? null, signal);

    if (preview.downloaded) {
      filesDownloaded += 1;
      bytesDownloaded += preview.cached?.sizeBytes ?? 0;
    }

    const manifest: CachedModelManifest = {
      modelId: model.id,
      name: model.name,
      tags: model.tags,
      categories: model.categories,
      authors: model.authors,
      resolution,
      filesHash: model.filesHash,
      gltfPath: fileSet.gltfPath,
      files: fileSet.files.map(({ path, sizeBytes, md5 }) => ({
        path,
        sizeBytes,
        md5,
      })),
      preview: preview.cached,
      fetchedAt: new Date().toISOString(),
    };

    await this.cache.writeManifest(manifest);
    this.logger.info(
      {
        modelId: model.id,
        files: fileSet.files.length,
        filesDownloaded,
        bytesDownloaded,
      },
      'Model cached',
    );

    return this.result(
      filesDownloaded > 0 ? 'fetched' : 'up-to-date',
      filesDownloaded,
      bytesDownloaded,
    );
  }

  /**
   * Keeps the cached preview in step with the catalog: reused while its source URL (which
   * carries the render's version) is unchanged and the file is intact, downloaded otherwise.
   * A failed download fails the model, so the next run tries again instead of importing it
   * without the image search needs.
   */
  private async syncPreview(
    model: PolyhavenModel,
    modelDir: string,
    cached: CachedPreview | null,
    signal: AbortSignal,
  ): Promise<{ cached: CachedPreview | null; downloaded: boolean }> {
    if (model.previewUrl === null) {
      return {
        cached: null,
        downloaded: cached !== null,
      };
    }

    const path = this.cache.filePath(modelDir, PREVIEW_FILE_NAME);

    if (cached?.sourceUrl === model.previewUrl && (await this.cache.hasFile(path, cached))) {
      return {
        cached,
        downloaded: false,
      };
    }

    const previewUrl = model.previewUrl;
    const stored = await this.tasks.retry(
      async () =>
        this.cache.writeBoundedFile(
          await this.polyhaven.downloadPreview(previewUrl, signal),
          path,
          MAX_PREVIEW_SIZE_BYTES,
        ),
      this.retryPolicy,
      signal,
    );

    return {
      cached: {
        path: PREVIEW_FILE_NAME,
        sizeBytes: stored.sizeBytes,
        md5: stored.md5,
        contentType: POLYHAVEN_PREVIEW_CONTENT_TYPE,
        sourceUrl: previewUrl,
      },
      downloaded: true,
    };
  }

  /** Downloads the file unless it is already cached intact; returns whether it downloaded. */
  private async downloadIfMissing(
    modelDir: string,
    file: RemoteFile,
    signal: AbortSignal,
  ): Promise<boolean> {
    const path = this.cache.filePath(modelDir, file.path);

    if (await this.cache.hasFile(path, file)) {
      return false;
    }

    // The whole download is retried: a broken stream can't be resumed mid-file.
    await this.tasks.retry(
      async () => {
        const body = await this.polyhaven.download(file.url, signal);

        await this.cache.writeFile(body, path, file);
      },
      this.retryPolicy,
      signal,
    );

    return true;
  }

  private async allCached(modelDir: string, files: CachedFile[]): Promise<boolean> {
    for (const file of files) {
      if (!(await this.cache.hasFile(this.cache.filePath(modelDir, file.path), file))) {
        return false;
      }
    }

    return true;
  }

  /** Requested ids (unknown ones become failures) or the whole catalog, sorted by id, limited. */
  private select(
    catalog: PolyhavenModel[],
    args: FetchArgs,
    summary: FetchSummary,
  ): PolyhavenModel[] {
    let models = catalog;

    if (args.ids !== undefined) {
      const known = new Set(catalog.map((model) => model.id));

      for (const id of args.ids.filter((requested) => !known.has(requested))) {
        summary.failures.push({
          modelId: id,
          reason: 'Not in the Poly Haven catalog',
        });
      }

      const requested = new Set(args.ids);

      models = catalog.filter((model) => requested.has(model.id));
    }

    // Sorted so `--limit N` always means the same N models (reproducible runs).
    const sorted = [...models].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    return args.limit === undefined ? sorted : sorted.slice(0, args.limit);
  }

  private result(
    status: ModelFetchResult['status'],
    filesDownloaded: number,
    bytesDownloaded: number,
  ): ModelFetchResult {
    return {
      status,
      filesDownloaded,
      bytesDownloaded,
    };
  }
}
