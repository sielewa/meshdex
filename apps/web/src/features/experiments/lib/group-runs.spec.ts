import { describe, expect, it } from 'vitest';
import type {
  BenchmarkRecord,
  BenchmarkRun,
  ImportRunOptions,
} from '@/features/experiments/lib/benchmark-run.schema';
import { groupRuns } from '@/features/experiments/lib/group-runs';

interface RunOverrides {
  startedAt: string;
  label?: string | null;
  options?: Partial<ImportRunOptions>;
  environment?: Partial<BenchmarkRecord['environment']>;
}

let fileCounter = 0;

function run({ startedAt, label = null, options, environment }: RunOverrides): BenchmarkRun {
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
        wallMs: 800,
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

describe('groupRuns', () => {
  it('compares configurations of the same work and names what differs between them', () => {
    const [workload, ...rest] = groupRuns([
      run({ startedAt: '2026-11-12T20:00:01Z', label: '1k50-main' }),
      run({
        startedAt: '2026-11-12T20:00:02Z',
        label: '1k50-workers',
        options: { packInWorkers: true },
      }),
      run({ startedAt: '2026-11-12T20:00:03Z', label: '1k50-main' }),
    ]);

    expect(rest).toEqual([]);
    expect(workload?.differences).toEqual(['packInWorkers']);
    expect(
      workload?.configurations.map((configuration) => ({
        labels: configuration.labels,
        runs: configuration.runs.length,
      })),
    ).toEqual([
      { labels: ['1k50-main'], runs: 2 },
      { labels: ['1k50-workers'], runs: 1 },
    ]);
  });

  it('keeps different data and different machines in separate workloads', () => {
    const workloads = groupRuns([
      run({ startedAt: '2026-11-12T20:00:01Z' }),
      run({ startedAt: '2026-11-12T20:00:02Z', options: { resolution: '4k', limit: 10 } }),
      run({ startedAt: '2026-11-12T20:00:03Z', options: { limit: 10 } }),
      run({ startedAt: '2026-11-12T20:00:04Z', environment: { cpuModel: 'AMD EPYC 7R13' } }),
    ]);

    expect(workloads).toHaveLength(4);
  });

  it('orders workloads by resolution, then by number of models', () => {
    const workloads = groupRuns([
      run({ startedAt: '2026-11-12T20:00:01Z', options: { resolution: '4k', limit: 10 } }),
      run({ startedAt: '2026-11-12T20:00:02Z', options: { limit: null } }),
      run({ startedAt: '2026-11-12T20:00:03Z', options: { limit: 50 } }),
    ]);

    expect(workloads.map(({ options }) => [options.resolution, options.limit])).toEqual([
      ['1k', 50],
      ['1k', null],
      ['4k', 10],
    ]);
  });

  it('treats the same model ids in another order as the same work', () => {
    const workloads = groupRuns([
      run({ startedAt: '2026-11-12T20:00:01Z', options: { limit: null, ids: ['b', 'a'] } }),
      run({ startedAt: '2026-11-12T20:00:02Z', options: { limit: null, ids: ['a', 'b'] } }),
    ]);

    expect(workloads).toHaveLength(1);
  });

  it('separates the same options run from different code, a dirty tree included', () => {
    const [workload] = groupRuns([
      run({ startedAt: '2026-11-12T20:00:01Z', environment: { gitCommit: 'aaaaaaa' } }),
      run({ startedAt: '2026-11-12T20:00:02Z', environment: { gitCommit: 'bbbbbbb' } }),
      run({
        startedAt: '2026-11-12T20:00:03Z',
        environment: { gitCommit: 'bbbbbbb', gitDirty: true },
      }),
    ]);

    expect(workload?.configurations).toHaveLength(3);
    expect(workload?.differences).toEqual(['gitCommit']);
  });

  it('orders runs and configurations by the time they were recorded, not by input order', () => {
    const [workload] = groupRuns([
      run({ startedAt: '2026-11-12T20:00:03Z', options: { packInWorkers: true } }),
      run({ startedAt: '2026-11-12T20:00:02Z' }),
      run({ startedAt: '2026-11-12T20:00:01Z' }),
    ]);

    expect(workload?.configurations.map((c) => c.options.packInWorkers)).toEqual([false, true]);
    expect(workload?.configurations[0]?.runs.map((r) => r.record.startedAt)).toEqual([
      '2026-11-12T20:00:01Z',
      '2026-11-12T20:00:02Z',
    ]);
  });
});
