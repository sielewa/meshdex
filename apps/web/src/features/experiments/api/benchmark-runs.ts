import 'server-only';
import bundle from '@/features/experiments/api/benchmark-runs.generated.json';
import { benchmarkBundleSchema } from '@/features/experiments/lib/benchmark-run.schema';
import { resolveExperiments } from '@/features/experiments/lib/resolve-experiments';
import type { Experiment } from '@/features/experiments/types/experiment';

let experiments: Experiment[] | undefined;

/**
 * The experiments and runs bundled at build time by `scripts/collect-benchmark-runs.ts`
 * (ADR 015, 016). Parsed once per server process: the data can't change without a new build.
 */
export function getExperiments(): Experiment[] {
  experiments ??= resolveExperiments(benchmarkBundleSchema.parse(bundle));

  return experiments;
}
