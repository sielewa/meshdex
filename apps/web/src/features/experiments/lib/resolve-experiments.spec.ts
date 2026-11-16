import { describe, expect, it } from 'vitest';
import { buildBenchmarkRun as run } from '@/features/experiments/lib/benchmark-run.fixture';
import type { ExperimentDefinition } from '@/features/experiments/lib/benchmark-run.schema';
import { resolveExperiments } from '@/features/experiments/lib/resolve-experiments';

function experiment(id: string, runs: string[]): ExperimentDefinition {
  return {
    id,
    title: id,
    question: 'Which is faster?',
    report: 'ingest-import.md',
    runs,
  };
}

describe('resolveExperiments', () => {
  const main = run({ startedAt: '2026-11-12T20:00:01Z' });
  const workers = run({ startedAt: '2026-11-12T20:00:02Z', options: { packInWorkers: true } });
  const eightUploaders = run({
    startedAt: '2026-11-13T09:00:01Z',
    options: { uploadConcurrency: 8 },
    environment: { gitCommit: 'bbbbbbb' },
  });
  const runs = [main, workers, eightUploaders];

  it('compares runs of the same data only within their experiment', () => {
    const [packing, sweep] = resolveExperiments({
      experiments: {
        experiments: [
          experiment('packing', [main.file, workers.file]),
          experiment('sweep', [main.file, eightUploaders.file]),
        ],
      },
      runs,
    });

    expect(packing?.workloads[0]?.differences).toEqual(['packInWorkers']);
    expect(sweep?.workloads[0]?.differences).toEqual(['uploadConcurrency', 'gitCommit']);
  });

  it('refuses a manifest that lists a run that was not recorded', () => {
    expect(() =>
      resolveExperiments({
        experiments: { experiments: [experiment('packing', ['missing.json'])] },
        runs,
      }),
    ).toThrow('lists missing.json');
  });

  it('refuses an experiment id used twice', () => {
    expect(() =>
      resolveExperiments({
        experiments: {
          experiments: [experiment('packing', [main.file]), experiment('packing', [workers.file])],
        },
        runs,
      }),
    ).toThrow('defined twice');
  });
});
