import { describe, expect, it } from 'vitest';
import { buildBenchmarkRun as run } from '@/features/experiments/lib/benchmark-run.fixture';
import { groupRuns } from '@/features/experiments/lib/group-runs';

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
