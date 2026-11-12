import 'server-only';
import bundle from '@/features/experiments/api/benchmark-runs.generated.json';
import {
  type BenchmarkRun,
  benchmarkRunsSchema,
} from '@/features/experiments/lib/benchmark-run.schema';

let runs: BenchmarkRun[] | undefined;

/**
 * The runs bundled at build time by `scripts/collect-benchmark-runs.ts` (ADR 015). Parsed once
 * per server process: the data can't change without a new build.
 */
export function getBenchmarkRuns(): BenchmarkRun[] {
  runs ??= benchmarkRunsSchema.parse(bundle);

  return runs;
}
