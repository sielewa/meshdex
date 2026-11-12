import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PinoLogger } from 'nestjs-pino';
import type { CachedModelManifest } from '../cache/domain/cached-model-manifest.interface';
import { ModelCacheService } from '../cache/model-cache.service';
import { TaskRunnerService } from '../tasks/task-runner.service';
import type { GlbUpload } from './domain/glb-upload.interface';
import type { UploadedAsset } from './domain/uploaded-asset.interface';
import type { ImportArgs } from './dto/import.args';
import { ImportService } from './import.service';
import { ImportStateService } from './import-state.service';
import type { ModelPackerService } from './model-packer.service';
import type { ModelUploaderService } from './model-uploader.service';

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Packer and uploader fakes that share one counter: models packed but not yet uploaded,
 * i.e. GLBs the pipeline holds in memory.
 */
class Pipeline {
  inMemory = 0;
  maxInMemory = 0;
  packDelayMs = 0;
  uploadDelayMs = 0;
  readonly packFailures = new Set<string>();
  readonly uploadFailures = new Set<string>();
  readonly uploads: GlbUpload[] = [];

  readonly packer = {
    pack: async (manifest: CachedModelManifest): Promise<Uint8Array> => {
      await delay(this.packDelayMs);

      if (this.packFailures.has(manifest.modelId)) {
        throw new Error('glTF extensions the packer cannot keep: X');
      }

      this.inMemory += 1;
      this.maxInMemory = Math.max(this.maxInMemory, this.inMemory);

      return new Uint8Array(manifest.modelId.length);
    },
  } as unknown as ModelPackerService;

  readonly uploader = {
    upload: async (upload: GlbUpload): Promise<UploadedAsset> => {
      await delay(this.uploadDelayMs);
      this.inMemory -= 1;

      if (this.uploadFailures.has(upload.fileName)) {
        throw new Error('asset-service: rejected');
      }

      this.uploads.push(upload);

      return {
        assetId: `asset-${upload.fileName}`,
        assetVersionId: `version-${upload.fileName}`,
      };
    },
  } as unknown as ModelUploaderService;
}

const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
} as unknown as PinoLogger;

describe('ImportService', () => {
  let dir: string;
  let cache: ModelCacheService;
  let pipeline: Pipeline;
  let service: ImportService;
  const signal = new AbortController().signal;
  // A plain object (not typed as the class), so tests can spread it with overrides.
  const args = {
    resolution: '1k',
    packConcurrency: 2,
    uploadConcurrency: 2,
    queueSize: 2,
  } satisfies ImportArgs;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ingest-import-'));
    cache = new ModelCacheService({ dir });
    pipeline = new Pipeline();
    service = newService();
  });

  afterEach(async () => {
    await rm(dir, {
      recursive: true,
      force: true,
    });
  });

  function newService(): ImportService {
    return new ImportService(
      cache,
      pipeline.packer,
      pipeline.uploader,
      new ImportStateService(logger),
      new TaskRunnerService(logger),
      { dir },
      logger,
    );
  }

  async function cacheModels(...ids: string[]): Promise<void> {
    for (const modelId of ids) {
      await cacheModel({ modelId });
    }
  }

  async function cacheModel(overrides: Partial<CachedModelManifest>): Promise<void> {
    const manifest: CachedModelManifest = {
      modelId: 'Chair_01',
      name: 'Chair 01',
      tags: ['wood'],
      categories: ['furniture'],
      authors: ['Someone'],
      resolution: '1k',
      filesHash: 'v1',
      gltfPath: 'model.gltf',
      files: [],
      fetchedAt: '2026-11-12T12:00:00.000Z',
      ...overrides,
    };

    await mkdir(cache.modelDir(manifest.modelId, manifest.resolution), { recursive: true });
    await cache.writeManifest(manifest);
  }

  it('imports every cached model and skips them on the next run', async () => {
    await cacheModels('Chair_01', 'Table_01', 'Lamp_01');

    const first = await service.run(args, signal);
    const second = await newService().run(args, signal);

    expect(first).toMatchObject({
      modelsSelected: 3,
      modelsImported: 3,
      modelsAlreadyImported: 0,
      failures: [],
    });
    expect(second).toMatchObject({
      modelsImported: 0,
      modelsAlreadyImported: 3,
    });
    expect(pipeline.uploads).toHaveLength(3);
  });

  it('keeps the state per resolution and in the file given by --state', async () => {
    await cacheModels('Chair_01');
    await cacheModel({ modelId: 'Chair_01', resolution: '2k' });

    const statePath = join(dir, 'benchmark', 'state.jsonl');

    await service.run({ ...args, state: statePath }, signal);
    const otherResolution = await service.run(
      {
        ...args,
        state: statePath,
        resolution: '2k',
      },
      signal,
    );
    const freshState = await service.run(args, signal);

    expect(otherResolution.modelsImported).toBe(1);
    expect(freshState.modelsImported).toBe(1);
  });

  it('describes the asset with the polyhaven tag first, normalised and within the limits', async () => {
    await cacheModel({
      name: `  ${'Very long name '.repeat(20)}`,
      categories: ['Furniture', 'seating', 'collection: the_shed'],
      tags: [
        'Wooden  Chair',
        'furniture',
        'x'.repeat(51),
        ...Array.from({ length: 30 }, (_, index) => `tag${String(index)}`),
      ],
    });

    await service.run(args, signal);

    const [upload] = pipeline.uploads;

    expect(upload?.fileName).toBe('Chair_01.glb');
    expect(upload?.title.length).toBeLessThanOrEqual(200);
    expect(upload?.title.startsWith('Very long name')).toBe(true);
    expect(upload?.tags).toHaveLength(20);
    expect(upload?.tags.slice(0, 6)).toEqual([
      'polyhaven',
      'furniture',
      'seating',
      'the_shed',
      'wooden-chair',
      'tag0',
    ]);
  });

  it('records failed models, imports the rest and does not mark failures as imported', async () => {
    await cacheModels('A_01', 'B_01', 'C_01');
    pipeline.packFailures.add('A_01');
    pipeline.uploadFailures.add('B_01.glb');

    const summary = await service.run(args, signal);
    const rerun = await newService().run(args, signal);

    expect(summary.modelsImported).toBe(1);
    expect(summary.failures).toEqual([
      { modelId: 'A_01', reason: 'glTF extensions the packer cannot keep: X' },
      { modelId: 'B_01', reason: 'asset-service: rejected' },
    ]);
    expect(rerun.modelsAlreadyImported).toBe(1);
    expect(rerun.failures).toHaveLength(2);
  });

  it('never holds more packed models than packers + queue + uploaders', async () => {
    await cacheModels(...Array.from({ length: 12 }, (_, index) => `Model_${String(index)}`));
    // Uploads are the bottleneck: without backpressure all 12 GLBs would pile up.
    pipeline.uploadDelayMs = 10;

    const summary = await service.run(
      {
        ...args,
        packConcurrency: 1,
        queueSize: 1,
        uploadConcurrency: 1,
      },
      signal,
    );

    expect(summary.modelsImported).toBe(12);
    expect(pipeline.maxInMemory).toBe(3);
  });

  it('selects requested ids, reports ones not cached, and limits by id order', async () => {
    await cacheModels('C_01', 'A_01', 'B_01');
    await cacheModel({ modelId: 'D_01', resolution: '2k' });

    const requested = await service.run({ ...args, ids: ['B_01', 'D_01', 'Missing_01'] }, signal);

    expect(requested.modelsSelected).toBe(1);
    expect(requested.failures.map((failure) => failure.modelId)).toEqual(['D_01', 'Missing_01']);

    const limited = await newService().run(
      {
        ...args,
        limit: 2,
        state: join(dir, 's'),
      },
      signal,
    );

    expect(limited.modelsSelected).toBe(2);
    expect(pipeline.uploads.slice(1).map((upload) => upload.fileName)).toEqual([
      'A_01.glb',
      'B_01.glb',
    ]);
  });

  it('stops both stages when the caller aborts', async () => {
    await cacheModels(...Array.from({ length: 10 }, (_, index) => `Model_${String(index)}`));
    pipeline.uploadDelayMs = 20;

    const controller = new AbortController();
    const reason = new Error('Interrupted');
    const run = service.run(
      {
        ...args,
        packConcurrency: 1,
        uploadConcurrency: 1,
      },
      controller.signal,
    );

    await delay(30);
    controller.abort(reason);

    await expect(run).rejects.toBe(reason);
    expect(pipeline.uploads.length).toBeLessThan(10);
  });
});
