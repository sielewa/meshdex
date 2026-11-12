import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { benchmarkRecordSchema } from '@/features/experiments/lib/benchmark-run.schema';

// Vitest runs from apps/web.
const RUNS_DIR = resolve(process.cwd(), '../../docs/benchmarks/runs');
const committedRuns = readdirSync(RUNS_DIR).filter((file) => file.endsWith('.json'));

function readRun(file: string): unknown {
  return JSON.parse(readFileSync(join(RUNS_DIR, file), 'utf8'));
}

describe('benchmarkRecordSchema', () => {
  it('finds committed runs to check', () => {
    expect(committedRuns.length).toBeGreaterThan(0);
  });

  // The guard for the page: a run that doesn't match fails here, before it can break a build.
  it.each(committedRuns)('accepts the committed run %s', (file) => {
    expect(benchmarkRecordSchema.safeParse(readRun(file)).error).toBeUndefined();
  });

  it('rejects a record of another format version', () => {
    const record = { ...(readRun(committedRuns[0] ?? '') as object), version: 2 };

    expect(benchmarkRecordSchema.safeParse(record).success).toBe(false);
  });

  it('rejects a record without measurements', () => {
    const { measurements: _measurements, ...record } = readRun(committedRuns[0] ?? '') as {
      measurements: unknown;
    };

    expect(benchmarkRecordSchema.safeParse(record).success).toBe(false);
  });
});
