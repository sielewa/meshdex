import { describe, expect, it } from 'vitest';
import {
  buildBenchmarkRun as run,
  buildReindexRun as reindexRun,
} from '@/features/experiments/lib/benchmark-run.fixture';
import { findSetting, groupRuns, sweptSetting } from '@/features/experiments/lib/group-runs';
import type { RunConfiguration } from '@/features/experiments/types/workload';

function settingValue(configuration: RunConfiguration, id: string): unknown {
  return findSetting(configuration, id)?.value;
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

    expect(workloads.map(({ title }) => title)).toEqual([
      'Import · 1k textures · first 50 models',
      'Import · 1k textures · all cached models',
      'Import · 4k textures · first 10 models',
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

    expect(workload?.configurations.map((c) => settingValue(c, 'packInWorkers'))).toEqual([
      false,
      true,
    ]);
    expect(workload?.configurations[0]?.runs.map((r) => r.startedAt)).toEqual([
      '2026-11-12T20:00:01Z',
      '2026-11-12T20:00:02Z',
    ]);
  });

  it('orders a sweep of one numeric option by its value, not by recording order', () => {
    const [workload] = groupRuns(
      [4, 1, 8, 2].map((uploaders, index) =>
        run({
          startedAt: `2026-11-13T09:00:0${String(index)}Z`,
          options: { uploadConcurrency: uploaders },
        }),
      ),
    );

    expect(workload && sweptSetting(workload)).toBe('uploadConcurrency');
    expect(workload?.configurations.map((c) => settingValue(c, 'uploadConcurrency'))).toEqual([
      1, 2, 4, 8,
    ]);
  });

  it('does not treat a comparison across commits or of a flag as a sweep', () => {
    const [acrossCommits] = groupRuns([
      run({ startedAt: '2026-11-13T09:00:01Z', options: { uploadConcurrency: 1 } }),
      run({
        startedAt: '2026-11-13T09:00:02Z',
        options: { uploadConcurrency: 2 },
        environment: { gitCommit: 'bbbbbbb' },
      }),
    ]);
    const [flag] = groupRuns([
      run({ startedAt: '2026-11-13T09:00:01Z' }),
      run({ startedAt: '2026-11-13T09:00:02Z', options: { packInWorkers: true } }),
    ]);

    expect(acrossCommits && sweptSetting(acrossCommits)).toBeNull();
    expect(flag && sweptSetting(flag)).toBeNull();
  });

  it('reads reindex runs through their own settings and sorts a sweep of loader workers', () => {
    const [workload, ...rest] = groupRuns(
      [4, 0, 8, 1, 2].map((workers, index) =>
        reindexRun({
          startedAt: `2026-11-13T15:5${String(index)}:00Z`,
          options: { numWorkers: workers },
        }),
      ),
    );

    expect(rest).toEqual([]);
    expect(workload?.title).toBe('Reindex · 517 images · already embedded included');
    expect(workload?.metrics.map((metric) => metric.id)).toContain('steady-throughput');
    expect(workload && sweptSetting(workload)).toBe('numWorkers');
    expect(workload?.configurations.map((c) => settingValue(c, 'numWorkers'))).toEqual([
      0, 1, 2, 4, 8,
    ]);
  });

  it('keeps reindex runs over a different number of images in separate workloads', () => {
    const workloads = groupRuns([
      reindexRun({ startedAt: '2026-11-13T15:50:00Z', imagesSelected: 517 }),
      reindexRun({ startedAt: '2026-11-13T15:51:00Z', imagesSelected: 2000 }),
      reindexRun({ startedAt: '2026-11-13T15:52:00Z', options: { includeEmbedded: false } }),
    ]);

    expect(workloads).toHaveLength(3);
  });

  it('never compares runs of different commands', () => {
    const workloads = groupRuns([
      reindexRun({ startedAt: '2026-11-13T15:50:00Z' }),
      run({ startedAt: '2026-11-12T20:00:01Z' }),
    ]);

    expect(workloads.map((workload) => workload.command)).toEqual(['import', 'reindex']);
  });

  it('counts a different PyTorch version as a different configuration, not a sweep', () => {
    const [workload] = groupRuns([
      reindexRun({ startedAt: '2026-11-13T15:50:00Z', options: { batchSize: 32 } }),
      reindexRun({
        startedAt: '2026-11-13T15:51:00Z',
        options: { batchSize: 64 },
        environment: { torch: '2.16.0' },
      }),
    ]);

    expect(workload?.differences).toEqual(['batchSize', 'torch']);
    expect(workload && sweptSetting(workload)).toBeNull();
  });
});
