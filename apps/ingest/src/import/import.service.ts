import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { CachedModelManifest } from '../cache/domain/cached-model-manifest.interface';
import { CacheService } from '../cache/cache.service';
import { cacheConfig } from '../config/config.namespaces';
import type { RunMeasurements } from '../runs/domain/run-measurements.interface';
import { RunsService } from '../runs/runs.service';
import { RUN_RECORD_VERSION } from '../runs/runs.constants';
import { BoundedQueue } from '../tasks/bounded-queue';
import { TasksService } from '../tasks/tasks.service';
import type { GlbUpload } from '../upload/domain/glb-upload.interface';
import type { ModelPacker } from '../packing/domain/model-packer.interface';
import type { ImportRunOptions } from './domain/import-run-options.interface';
import type { ImportRunResult } from './domain/import-run-result.interface';
import type { ImportSummary } from './domain/import-summary.interface';
import type { PackedModel } from './domain/packed-model.interface';
import type { ImportArgs } from './dto/import.args';
import {
  COLLECTION_CATEGORY_PREFIX,
  GLB_EXTENSION,
  IMPORT_STATE_FILE_NAME,
  MAX_TAG_LENGTH,
  MAX_TAGS_PER_ASSET,
  MAX_TITLE_LENGTH,
  SOURCE_TAG,
} from './import.constants';
import { ImportStateService } from './import-state.service';
import { PackingService } from '../packing/packing.service';
import { UploadService } from '../upload/upload.service';
import { WorkerPackingService } from '../packing/worker-packing.service';

/**
 * `ingest import`: cached models → assets in asset-service (ADR 013), as a two-stage pipeline.
 *
 * ```
 * cached manifests ─▶ pack × P ─▶ BoundedQueue(Q) ─▶ upload × U ─▶ state file
 *                     (CPU, disk)                     (network)
 * ```
 *
 * Packing and uploading overlap: while one model's parts are on the wire, the next ones are
 * being packed. The queue is the only buffer between the stages, so at most P + Q + U packed
 * models are in memory at any time, whichever stage is slower: when uploads lag, packers
 * wait in `push`; when packing lags, uploaders wait in `take`. One model's failure is
 * recorded and the rest carry on; the caller's abort stops both stages.
 *
 * Every run is measured (`RunProbe`) and the measurements are logged; `--record <dir>` also
 * writes them as a JSON run record for benchmark reports.
 */
@Injectable()
export class ImportService {
  constructor(
    private readonly cache: CacheService,
    private readonly packer: PackingService,
    private readonly workerPacker: WorkerPackingService,
    private readonly uploader: UploadService,
    private readonly state: ImportStateService,
    private readonly tasks: TasksService,
    private readonly recorder: RunsService,
    @Inject(cacheConfig.KEY)
    private readonly cacheSettings: ConfigType<typeof cacheConfig>,
    @InjectPinoLogger(ImportService.name)
    private readonly logger: PinoLogger,
  ) {}

  async run(args: ImportArgs, signal: AbortSignal): Promise<ImportSummary> {
    const startedAt = new Date().toISOString();
    const probe = this.recorder.start();
    let summary: ImportSummary;

    try {
      summary = await this.execute(args, signal);
    } catch (error) {
      probe.stop();
      throw error;
    }

    const measurements = probe.stop();

    summary.durationMs = measurements.wallMs;
    this.logger.info({ ...summary, measurements }, 'Import finished');

    if (args.record !== undefined) {
      const path = await this.recorder.write<ImportRunOptions, ImportRunResult>(args.record, {
        version: RUN_RECORD_VERSION,
        command: 'import',
        label: args.label ?? null,
        startedAt,
        options: {
          resolution: args.resolution,
          packConcurrency: args.packConcurrency,
          packInWorkers: args.packInWorkers === true,
          uploadConcurrency: args.uploadConcurrency,
          queueSize: args.queueSize,
          limit: args.limit ?? null,
          ids: args.ids ?? null,
        },
        environment: await this.recorder.environment(),
        measurements,
        result: this.runResult(summary, measurements),
      });

      this.logger.info({ path }, 'Run recorded');
    }

    return summary;
  }

  private async execute(args: ImportArgs, signal: AbortSignal): Promise<ImportSummary> {
    const statePath =
      args.state === undefined
        ? join(this.cacheSettings.dir, IMPORT_STATE_FILE_NAME)
        : resolve(args.state);
    const summary: ImportSummary = {
      modelsSelected: 0,
      modelsImported: 0,
      modelsAlreadyImported: 0,
      failures: [],
      bytesUploaded: 0,
      durationMs: 0,
      pipeline: {
        packBusyMs: 0,
        uploadBusyMs: 0,
        packerBlockedMs: 0,
        uploaderIdleMs: 0,
        maxQueued: 0,
      },
    };
    const selected = await this.select(args, summary);
    const imported = new Set(
      (await this.state.load(statePath))
        .filter((record) => record.resolution === args.resolution)
        .map((record) => record.modelId),
    );
    const pending = selected.filter((manifest) => !imported.has(manifest.modelId));

    summary.modelsSelected = selected.length;
    summary.modelsAlreadyImported = selected.length - pending.length;
    this.logger.info(
      {
        models: selected.length,
        pending: pending.length,
        resolution: args.resolution,
        packConcurrency: args.packConcurrency,
        uploadConcurrency: args.uploadConcurrency,
        queueSize: args.queueSize,
        statePath,
      },
      'Import started',
    );

    // Workers are started inside the measured run: their start-up is part of what they cost.
    const pool =
      args.packInWorkers === true && pending.length > 0
        ? this.workerPacker.open(args.packConcurrency)
        : null;

    try {
      await this.runPipeline(pending, pool ?? this.packer, args, statePath, summary, signal);
    } finally {
      await pool?.close();
    }

    const { pipeline } = summary;

    summary.pipeline = {
      packBusyMs: Math.round(pipeline.packBusyMs),
      uploadBusyMs: Math.round(pipeline.uploadBusyMs),
      packerBlockedMs: Math.round(pipeline.packerBlockedMs),
      uploaderIdleMs: Math.round(pipeline.uploaderIdleMs),
      maxQueued: pipeline.maxQueued,
    };

    return summary;
  }

  private async runPipeline(
    pending: CachedModelManifest[],
    packer: ModelPacker,
    args: ImportArgs,
    statePath: string,
    summary: ImportSummary,
    signal: AbortSignal,
  ): Promise<void> {
    const queue = new BoundedQueue<PackedModel>(args.queueSize);
    const stats = summary.pipeline;
    const onAbort = (): void => {
      queue.abort(signal.reason);
    };

    signal.addEventListener('abort', onAbort, { once: true });

    try {
      const packing = this.tasks
        .forEach(pending, args.packConcurrency, async (manifest) => {
          const packed = await this.pack(packer, manifest, summary, signal);

          if (packed !== null) {
            const waitStartedAt = performance.now();

            await queue.push(packed);
            stats.packerBlockedMs += performance.now() - waitStartedAt;
            stats.maxQueued = Math.max(stats.maxQueued, queue.size);
          }
        })
        .finally(() => {
          queue.close();
        });
      const uploading = Promise.all(
        Array.from({ length: args.uploadConcurrency }, async () => {
          for (;;) {
            const waitStartedAt = performance.now();
            const packed = await queue.take();

            stats.uploaderIdleMs += performance.now() - waitStartedAt;

            if (packed === undefined) {
              return;
            }

            const uploadStartedAt = performance.now();

            await this.upload(packed, statePath, summary, signal);
            stats.uploadBusyMs += performance.now() - uploadStartedAt;
          }
        }),
      ).catch((error: unknown) => {
        // Packers must not wait forever for upload workers that are gone.
        queue.abort(error);
        throw error;
      });

      await Promise.all([packing, uploading]);
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
  }

  /** Pack stage: the model's GLB, or `null` when packing failed (recorded in the summary). */
  private async pack(
    packer: ModelPacker,
    manifest: CachedModelManifest,
    summary: ImportSummary,
    signal: AbortSignal,
  ): Promise<PackedModel | null> {
    signal.throwIfAborted();

    const startedAt = performance.now();

    try {
      const glb = await packer.pack(manifest);
      const packMs = performance.now() - startedAt;

      summary.pipeline.packBusyMs += packMs;

      return {
        manifest,
        glb,
        packMs: Math.round(packMs),
      };
    } catch (error) {
      this.recordFailure(manifest.modelId, error, summary, signal);

      return null;
    }
  }

  /** Upload stage: the asset, then its line in the state file. */
  private async upload(
    packed: PackedModel,
    statePath: string,
    summary: ImportSummary,
    signal: AbortSignal,
  ): Promise<void> {
    const { manifest, glb } = packed;
    const startedAt = performance.now();

    try {
      const asset = await this.uploader.upload(
        this.describe(manifest, glb, await this.readPreview(manifest)),
        signal,
      );

      // A crash between these two lines leaves an asset the state file doesn't know about;
      // the re-run imports that model again. The window is one local file append.
      await this.state.append(statePath, {
        modelId: manifest.modelId,
        resolution: manifest.resolution,
        assetId: asset.assetId,
        assetVersionId: asset.assetVersionId,
        sizeBytes: glb.byteLength,
        importedAt: new Date().toISOString(),
      });
      summary.modelsImported += 1;
      summary.bytesUploaded += glb.byteLength;
      this.logger.info(
        {
          modelId: manifest.modelId,
          assetId: asset.assetId,
          sizeBytes: glb.byteLength,
          packMs: packed.packMs,
          uploadMs: Math.round(performance.now() - startedAt),
        },
        'Model imported',
      );
    } catch (error) {
      this.recordFailure(manifest.modelId, error, summary, signal);
    }
  }

  /**
   * Poly Haven metadata fitted to asset-service's limits, so it never rejects a model over
   * its description: `polyhaven` first (it must survive the cap, the credit depends on it),
   * then categories (broad; `collection: x` becomes `x`) and tags (specific). Tags are normalised the way asset-service
   * does it, so duplicates collapse before counting; overlong ones are left out.
   */
  private describe(
    manifest: CachedModelManifest,
    glb: Uint8Array,
    sourcePreview: GlbUpload['sourcePreview'],
  ): GlbUpload {
    const tags: string[] = [];

    const categories = manifest.categories.map((category) =>
      category.replace(COLLECTION_CATEGORY_PREFIX, ''),
    );

    for (const raw of [SOURCE_TAG, ...categories, ...manifest.tags]) {
      const tag = raw.trim().toLowerCase().replace(/\s+/g, '-');

      if (tag !== '' && tag.length <= MAX_TAG_LENGTH && !tags.includes(tag)) {
        tags.push(tag);
      }
    }

    const title = manifest.name.trim().slice(0, MAX_TITLE_LENGTH).trim();

    return {
      title: title === '' ? manifest.modelId : title,
      tags: tags.slice(0, MAX_TAGS_PER_ASSET),
      fileName: `${manifest.modelId}${GLB_EXTENSION}`,
      glb,
      sourcePreview,
    };
  }

  /**
   * The cached preview image (ADR 017), read in the upload stage: it is ~35 KB, so it doesn't
   * change the pipeline's memory bound, and the pack stage (possibly in a worker thread) stays
   * about the GLB. A model cached before previews existed is imported without one.
   */
  private async readPreview(manifest: CachedModelManifest): Promise<GlbUpload['sourcePreview']> {
    const preview = manifest.preview;

    if (!preview) {
      return null;
    }

    const modelDir = this.cache.modelDir(manifest.modelId, manifest.resolution);

    return {
      bytes: await this.cache.readVerifiedFile(
        this.cache.filePath(modelDir, preview.path),
        preview,
      ),
      contentType: preview.contentType,
    };
  }

  /**
   * Cached models at the requested resolution, sorted by id, then `--ids` (requested ids that
   * aren't cached become failures) and `--limit`. The selection doesn't depend on the state
   * file, so `--limit N` always means the same N models.
   */
  private async select(args: ImportArgs, summary: ImportSummary): Promise<CachedModelManifest[]> {
    const cachedIds = await this.cache.listModelIds();
    const requested = args.ids === undefined ? null : new Set(args.ids);
    const manifests: CachedModelManifest[] = [];

    for (const modelId of cachedIds) {
      if (requested !== null && !requested.has(modelId)) {
        continue;
      }

      const manifest = await this.cache.readManifest(modelId, args.resolution);

      if (manifest !== null) {
        manifests.push(manifest);
      }
    }

    if (args.ids !== undefined) {
      const found = new Set(manifests.map((manifest) => manifest.modelId));

      for (const modelId of args.ids.filter((id) => !found.has(id))) {
        summary.failures.push({
          modelId,
          reason: `Not in the cache at ${args.resolution}; run fetch first`,
        });
      }
    }

    return args.limit === undefined ? manifests : manifests.slice(0, args.limit);
  }

  private runResult(summary: ImportSummary, measurements: RunMeasurements): ImportRunResult {
    const { durationMs: _durationMs, ...result } = summary;
    const seconds = measurements.wallMs / 1000;
    const perSecond = (value: number): number =>
      seconds > 0 ? Math.round((value / seconds) * 100) / 100 : 0;

    return {
      ...result,
      modelsPerSecond: perSecond(summary.modelsImported),
      megabytesPerSecond: perSecond(summary.bytesUploaded / 1e6),
    };
  }

  /** The caller's abort is not a model failure: it is rethrown and stops the run. */
  private recordFailure(
    modelId: string,
    error: unknown,
    summary: ImportSummary,
    signal: AbortSignal,
  ): void {
    if (signal.aborted) {
      throw error;
    }

    summary.failures.push({
      modelId,
      reason: error instanceof Error ? error.message : String(error),
    });
    this.logger.warn({ modelId, err: error }, 'Model import failed');
  }
}
