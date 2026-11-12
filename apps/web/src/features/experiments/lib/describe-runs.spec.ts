import { describe, expect, it } from 'vitest';
import { buildBenchmarkRun as run } from '@/features/experiments/lib/benchmark-run.fixture';
import {
  describeCommit,
  describeConfiguration,
  describeWorkload,
} from '@/features/experiments/lib/describe-runs';
import { groupRuns } from '@/features/experiments/lib/group-runs';

describe('describeWorkload', () => {
  it.each([
    [{ limit: 50, ids: null }, 'Import · 1k textures · first 50 models'],
    [{ limit: null, ids: ['a', 'b'] }, 'Import · 1k textures · 2 chosen models'],
    [{ limit: null, ids: null }, 'Import · 1k textures · all cached models'],
  ])('names the data of %j', (options, expected) => {
    const [workload] = groupRuns([run({ startedAt: '2026-11-12T20:00:01Z', options })]);

    expect(workload && describeWorkload(workload)).toBe(expected);
  });
});

describe('describeConfiguration', () => {
  it('names a configuration only by what differs from the others', () => {
    const [workload] = groupRuns([
      run({ startedAt: '2026-11-12T20:00:01Z' }),
      run({ startedAt: '2026-11-12T20:00:02Z', options: { packInWorkers: true } }),
    ]);

    expect(
      workload?.configurations.map((configuration) =>
        describeConfiguration(configuration, workload.differences),
      ),
    ).toEqual(['main thread', 'worker threads']);
  });

  it('describes every option of a lone configuration', () => {
    const [workload] = groupRuns([run({ startedAt: '2026-11-12T20:00:01Z' })]);
    const [configuration] = workload?.configurations ?? [];

    expect(configuration && describeConfiguration(configuration, [])).toBe(
      '2 packers · main thread · 4 uploaders · queue 4',
    );
  });
});

describe('describeCommit', () => {
  it('shortens the commit and marks uncommitted changes', () => {
    const [workload] = groupRuns([
      run({
        startedAt: '2026-11-12T20:00:01Z',
        environment: { gitCommit: '1c22834abcdef', gitDirty: true },
      }),
    ]);
    const [configuration] = workload?.configurations ?? [];

    expect(configuration && describeCommit(configuration)).toBe('1c22834 + changes');
  });
});
