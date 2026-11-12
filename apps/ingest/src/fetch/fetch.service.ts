import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { CachedFile } from '../cache/domain/cached-file.interface';
import { UnsafeCachePathException } from '../cache/exceptions/unsafe-cache-path.exception';
import { ModelCacheService } from '../cache/model-cache.service';
import type { PolyhavenModel } from '../clients/polyhaven/domain/polyhaven-model.interface';
import type { PolyhavenPort } from '../clients/polyhaven/domain/polyhaven-port.interface';
import type { RemoteFile } from '../clients/polyhaven/domain/remote-file.interface';
import type { TextureResolution } from '../clients/polyhaven/domain/texture-resolution.type';
import { PolyhavenRequestException } from '../clients/polyhaven/exceptions/polyhaven-request.exception';
import { POLYHAVEN } from '../clients/polyhaven/polyhaven.tokens';
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
 */
@Injectable()
export class FetchService {
  constructor(
    @Inject(POLYHAVEN)
    private readonly polyhaven: PolyhavenPort,
    private readonly cache: ModelCacheService,
    @InjectPinoLogger(FetchService.name)
    private readonly logger: PinoLogger,
  ) {}

  async run(args: FetchArgs, signal: AbortSignal): Promise<FetchSummary> {
    const startedAt = performance.now();
    const catalog = await this.withRetry(() => this.polyhaven.listModels(signal), signal);
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

    await this.runWithConcurrency(models, args.concurrency, async (model) => {
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
      return this.result('up-to-date', 0, 0);
    }

    const fileSet = await this.withRetry(
      () => this.polyhaven.findGltfFiles(model.id, resolution, signal),
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

    await this.cache.writeManifest({
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
      fetchedAt: new Date().toISOString(),
    });
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
    await this.withRetry(async () => {
      const body = await this.polyhaven.download(file.url, signal);

      await this.cache.writeFile(body, path, file);
    }, signal);

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

  /**
   * Runs `worker` over `items` with at most `limit` calls in flight: `limit` loops share one
   * index, each taking the next item when its previous one finishes.
   */
  private async runWithConcurrency<T>(
    items: T[],
    limit: number,
    worker: (item: T) => Promise<void>,
  ): Promise<void> {
    let next = 0;
    const loops = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const item = items[next] as T;

        next += 1;
        await worker(item);
      }
    });

    await Promise.all(loops);
  }

  /**
   * Retries transient failures (network errors, timeouts, 429/5xx, truncated downloads) with
   * exponential backoff and full jitter, so parallel retries don't hit the API in lockstep.
   * Unsafe paths, non-retryable API answers and the caller's abort fail at once.
   */
  private async withRetry<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        const permanent =
          signal.aborted ||
          error instanceof UnsafeCachePathException ||
          (error instanceof PolyhavenRequestException && !error.retryable);

        if (permanent || attempt >= FETCH_RETRY_ATTEMPTS) {
          throw error;
        }

        const cap = Math.min(FETCH_RETRY_MAX_DELAY_MS, FETCH_RETRY_BASE_DELAY_MS * 2 ** attempt);

        this.logger.debug({ attempt, err: error }, 'Retrying after a transient failure');
        await sleep(Math.random() * cap, undefined, { signal });
      }
    }
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
