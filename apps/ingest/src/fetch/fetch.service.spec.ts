import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import type { PinoLogger } from 'nestjs-pino';
import { ModelCacheService } from '../cache/model-cache.service';
import type { ModelFileSet } from '../clients/polyhaven/domain/model-file-set.interface';
import type { PolyhavenModel } from '../clients/polyhaven/domain/polyhaven-model.interface';
import type { PolyhavenPort } from '../clients/polyhaven/domain/polyhaven-port.interface';
import { PolyhavenRequestException } from '../clients/polyhaven/exceptions/polyhaven-request.exception';
import { FetchService } from './fetch.service';

/** In-memory Poly Haven: every model has a .gltf and a .bin; downloads are counted. */
class FakePolyhaven implements PolyhavenPort {
  readonly downloads: string[] = [];
  readonly fileListings: string[] = [];
  inFlight = 0;
  maxInFlight = 0;
  failNextDownloads = 0;
  readonly contents = new Map<string, Buffer>();

  constructor(readonly models: PolyhavenModel[]) {
    for (const model of models) {
      this.contents.set(
        `https://dl.example/${model.id}.gltf`,
        Buffer.from(`{"asset":"${model.id}"}`),
      );
      this.contents.set(`https://dl.example/${model.id}.bin`, Buffer.alloc(1024, model.id));
    }
  }

  listModels(): Promise<PolyhavenModel[]> {
    return Promise.resolve(this.models);
  }

  findGltfFiles(modelId: string): Promise<ModelFileSet | null> {
    this.fileListings.push(modelId);

    if (modelId.startsWith('NoGltf')) {
      return Promise.resolve(null);
    }

    const files = ['gltf', 'bin'].map((extension) => {
      const url = `https://dl.example/${modelId}.${extension}`;
      const content = this.contents.get(url) as Buffer;

      return {
        path: `${modelId}.${extension}`,
        url,
        sizeBytes: content.length,
        md5: createHash('md5').update(content).digest('hex'),
      };
    });

    return Promise.resolve({
      gltfPath: `${modelId}.gltf`,
      files,
    });
  }

  async download(url: string): Promise<Readable> {
    this.downloads.push(url);
    this.inFlight += 1;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    // Let other workers start, so the concurrency limit is actually exercised.
    await new Promise((resolve) => setTimeout(resolve, 5));
    this.inFlight -= 1;

    if (this.failNextDownloads > 0) {
      this.failNextDownloads -= 1;
      throw new PolyhavenRequestException('HTTP 503', true);
    }

    return Readable.from([this.contents.get(url) as Buffer]);
  }
}

function model(id: string, filesHash: string | null = 'v1'): PolyhavenModel {
  return {
    id,
    name: id.replace('_', ' '),
    tags: ['tag'],
    categories: ['category'],
    authors: ['Author'],
    filesHash,
  };
}

const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
} as unknown as PinoLogger;
const signal = new AbortController().signal;

describe('FetchService', () => {
  let dir: string;
  let cache: ModelCacheService;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ingest-fetch-'));
    cache = new ModelCacheService({ dir });
    // Full jitter with random() = 0 → retries without waiting.
    jest.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await rm(dir, {
      recursive: true,
      force: true,
    });
  });

  it('caches every file of each model and writes the manifest last', async () => {
    const polyhaven = new FakePolyhaven([model('Chair_01'), model('Table_01')]);
    const service = new FetchService(polyhaven, cache, logger);

    const summary = await service.run({ resolution: '1k', concurrency: 2 }, signal);

    expect(summary).toMatchObject({
      modelsSelected: 2,
      modelsFetched: 2,
      filesDownloaded: 4,
      failures: [],
    });
    expect(await readFile(join(dir, 'Chair_01', '1k', 'Chair_01.gltf'), 'utf8')).toBe(
      '{"asset":"Chair_01"}',
    );
    expect(await cache.readManifest('Chair_01', '1k')).toMatchObject({
      name: 'Chair 01',
      gltfPath: 'Chair_01.gltf',
      filesHash: 'v1',
    });
  });

  it('skips models whose cached files_hash matches without calling the API again', async () => {
    const polyhaven = new FakePolyhaven([model('Chair_01')]);
    const service = new FetchService(polyhaven, cache, logger);

    await service.run({ resolution: '1k', concurrency: 1 }, signal);
    const second = await service.run({ resolution: '1k', concurrency: 1 }, signal);

    expect(second.modelsUpToDate).toBe(1);
    expect(polyhaven.fileListings).toEqual(['Chair_01']);
    expect(polyhaven.downloads).toHaveLength(2);
  });

  it('downloads only the files missing after an interrupted run', async () => {
    const polyhaven = new FakePolyhaven([model('Chair_01')]);
    const service = new FetchService(polyhaven, cache, logger);
    const fileSet = (await polyhaven.findGltfFiles('Chair_01')) as ModelFileSet;
    const gltf = fileSet.files[0] as ModelFileSet['files'][number];

    // Only the .gltf made it to disk and no manifest was written.
    await cache.writeFile(
      Readable.from([polyhaven.contents.get(gltf.url) as Buffer]),
      cache.filePath(cache.modelDir('Chair_01', '1k'), gltf.path),
      gltf,
    );

    const summary = await service.run({ resolution: '1k', concurrency: 1 }, signal);

    expect(summary.filesDownloaded).toBe(1);
    expect(polyhaven.downloads).toEqual(['https://dl.example/Chair_01.bin']);
  });

  it('re-fetches a model whose files_hash changed', async () => {
    const first = new FakePolyhaven([model('Chair_01', 'v1')]);

    await new FetchService(first, cache, logger).run({ resolution: '1k', concurrency: 1 }, signal);

    const changed = new FakePolyhaven([model('Chair_01', 'v2')]);
    const summary = await new FetchService(changed, cache, logger).run(
      { resolution: '1k', concurrency: 1 },
      signal,
    );

    // Listed again; files are identical, so nothing is downloaded but the manifest is updated.
    expect(changed.fileListings).toEqual(['Chair_01']);
    expect(summary.filesDownloaded).toBe(0);
    expect((await cache.readManifest('Chair_01', '1k'))?.filesHash).toBe('v2');
  });

  it('retries transient download failures', async () => {
    const polyhaven = new FakePolyhaven([model('Chair_01')]);

    polyhaven.failNextDownloads = 2;

    const summary = await new FetchService(polyhaven, cache, logger).run(
      { resolution: '1k', concurrency: 1 },
      signal,
    );

    expect(summary.failures).toEqual([]);
    expect(summary.filesDownloaded).toBe(2);
  });

  it('records a model as failed when retries run out and carries on with the rest', async () => {
    const polyhaven = new FakePolyhaven([model('Chair_01'), model('Table_01')]);

    polyhaven.failNextDownloads = 3;

    const summary = await new FetchService(polyhaven, cache, logger).run(
      { resolution: '1k', concurrency: 1 },
      signal,
    );

    expect(summary.failures).toEqual([
      {
        modelId: 'Chair_01',
        reason: 'HTTP 503',
      },
    ]);
    expect(summary.modelsFetched).toBe(1);
  });

  it('never has more downloads in flight than the concurrency', async () => {
    const polyhaven = new FakePolyhaven(
      Array.from({ length: 8 }, (_, index) => model(`Model_${index}`)),
    );

    await new FetchService(polyhaven, cache, logger).run(
      { resolution: '1k', concurrency: 3 },
      signal,
    );

    expect(polyhaven.maxInFlight).toBe(3);
  });

  it('selects requested ids, reports unknown ones and counts models without glTF', async () => {
    const polyhaven = new FakePolyhaven([model('Chair_01'), model('NoGltf_01'), model('Table_01')]);

    const summary = await new FetchService(polyhaven, cache, logger).run(
      {
        resolution: '1k',
        concurrency: 2,
        ids: ['NoGltf_01', 'Table_01', 'Missing_01'],
      },
      signal,
    );

    expect(summary).toMatchObject({
      modelsSelected: 2,
      modelsFetched: 1,
      modelsWithoutGltf: 1,
      failures: [
        {
          modelId: 'Missing_01',
          reason: 'Not in the Poly Haven catalog',
        },
      ],
    });
  });

  it('takes the first models by id with --limit', async () => {
    const polyhaven = new FakePolyhaven([model('C_01'), model('A_01'), model('B_01')]);

    await new FetchService(polyhaven, cache, logger).run(
      {
        resolution: '1k',
        concurrency: 1,
        limit: 2,
      },
      signal,
    );

    expect(polyhaven.fileListings).toEqual(['A_01', 'B_01']);
  });
});
