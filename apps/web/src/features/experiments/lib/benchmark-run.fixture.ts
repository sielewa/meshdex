import type {
  BenchmarkRecord,
  BenchmarkRun,
  ImportRunOptions,
} from '@/features/experiments/lib/benchmark-run.schema';

export interface RunOverrides {
  startedAt: string;
  label?: string | null;
  options?: Partial<ImportRunOptions>;
  environment?: Partial<BenchmarkRecord['environment']>;
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
}: RunOverrides): BenchmarkRun {
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
