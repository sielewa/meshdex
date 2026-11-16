import type {
  BenchmarkRun,
  ImportRecord,
  ReindexRecord,
} from '@/features/experiments/lib/benchmark-run.schema';

export interface RunOverrides<R extends ImportRecord | ReindexRecord> {
  startedAt: string;
  label?: string | null;
  options?: Partial<R['options']>;
  environment?: Partial<R['environment']>;
  wallMs?: number;
}

let fileCounter = 0;

/** Test data: a valid import run with the settings of the recorded benchmarks. */
export function buildBenchmarkRun({
  startedAt,
  label = null,
  options,
  environment,
  wallMs = 800,
}: RunOverrides<ImportRecord>): BenchmarkRun {
  fileCounter += 1;

  return {
    file: `run-${String(fileCounter)}.json`,
    record: {
      version: 1,
      command: 'import',
      label,
      startedAt,
      options: {
        resolution: '1k',
        packConcurrency: 2,
        packInWorkers: false,
        uploadConcurrency: 4,
        queueSize: 4,
        limit: 50,
        ids: null,
        ...options,
      },
      environment: {
        node: 'v24.22.1',
        platform: 'darwin',
        arch: 'arm64',
        cpuModel: 'Apple M4',
        cpuCount: 10,
        totalMemoryBytes: 34_359_738_368,
        gitCommit: 'aaaaaaa',
        gitDirty: false,
        ...environment,
      },
      measurements: {
        wallMs,
        cpuUserMs: 700,
        cpuSystemMs: 100,
        peakRssBytes: 364_000_000,
        peakHeapUsedBytes: 40_000_000,
        peakArrayBuffersBytes: 90_000_000,
        eventLoopDelayMs: {
          p50: 0.2,
          p99: 5,
          max: 20,
        },
      },
      result: {
        modelsSelected: 50,
        modelsImported: 50,
        modelsAlreadyImported: 0,
        failures: [],
        bytesUploaded: 65_000_000,
        pipeline: {
          packBusyMs: 300,
          uploadBusyMs: 2900,
          packerBlockedMs: 900,
          uploaderIdleMs: 50,
          maxQueued: 4,
        },
        modelsPerSecond: 62.5,
        megabytesPerSecond: 81.3,
      },
    },
  };
}

/** Test data: a valid reindex run with the settings of the recorded sweep. */
export function buildReindexRun({
  startedAt,
  label = null,
  options,
  environment,
  wallMs = 4200,
  imagesSelected = 517,
  steadyImagesPerSecond = 245,
}: RunOverrides<ReindexRecord> & {
  imagesSelected?: number;
  steadyImagesPerSecond?: number;
}): BenchmarkRun {
  fileCounter += 1;

  return {
    file: `run-${String(fileCounter)}.json`,
    record: {
      version: 1,
      command: 'reindex',
      label,
      startedAt,
      options: {
        batchSize: 64,
        numWorkers: 2,
        prefetchFactor: 2,
        limit: null,
        includeEmbedded: true,
        device: 'mps',
        model: 'ViT-B-32/laion2b_s34b_b79k',
        ...options,
      },
      environment: {
        python: '3.12.16',
        torch: '2.15.0',
        platform: 'darwin',
        arch: 'arm64',
        cpuModel: 'Apple M4',
        cpuCount: 10,
        totalMemoryBytes: 34_359_738_368,
        gitCommit: 'aaaaaaa',
        gitDirty: false,
        ...environment,
      },
      measurements: {
        wallMs,
        cpuUserMs: 9000,
        cpuSystemMs: 1000,
        peakRssBytes: 1_000_000_000,
        peakWorkerRssBytes: 400_000_000,
      },
      result: {
        versionsListed: imagesSelected,
        versionsAlreadyEmbedded: 0,
        versionsWithoutImage: 0,
        versionsSelected: imagesSelected,
        versionsEmbedded: imagesSelected,
        versionsSuperseded: 0,
        imagesSelected,
        imagesEmbedded: imagesSelected,
        batches: Math.ceil(imagesSelected / 64),
        steadyImages: imagesSelected - 64,
        failures: [],
        stages: {
          listMs: 50,
          firstBatchMs: 1300,
          loaderWaitMs: 40,
          modelMs: 2000,
          writeMs: 200,
          shutdownMs: 300,
          steadyMs: 1800,
          workerFetchMs: 1000,
          workerDecodeMs: 800,
          workerPreprocessMs: 600,
        },
        imagesPerSecond: 120,
        steadyImagesPerSecond,
      },
    },
  };
}
