import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { experimentsManifestSchema } from '@/features/experiments/lib/benchmark-run.schema';

// Vitest runs from apps/web.
const BENCHMARKS_DIR = resolve(process.cwd(), '../../docs/benchmarks');
const committedRuns = readdirSync(join(BENCHMARKS_DIR, 'runs')).filter((file) =>
  file.endsWith('.json'),
);
const manifest = experimentsManifestSchema.parse(
  JSON.parse(readFileSync(join(BENCHMARKS_DIR, 'experiments.json'), 'utf8')),
);

// The guard for ADR 016: the manifest and the runs directory must agree before a build.
describe('docs/benchmarks/experiments.json', () => {
  it('lists only runs that were recorded', () => {
    const listed = manifest.experiments.flatMap((experiment) => experiment.runs);

    expect(listed.filter((file) => !committedRuns.includes(file))).toEqual([]);
  });

  it('puts every recorded run into an experiment', () => {
    const listed = new Set(manifest.experiments.flatMap((experiment) => experiment.runs));

    expect(committedRuns.filter((file) => !listed.has(file))).toEqual([]);
  });

  it('names each experiment once and points it at an existing report', () => {
    const ids = manifest.experiments.map((experiment) => experiment.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(
      manifest.experiments.filter(
        (experiment) => !existsSync(join(BENCHMARKS_DIR, experiment.report)),
      ),
    ).toEqual([]);
  });
});
