import 'server-only';
import bundle from '@/features/experiments/api/benchmark-runs.generated.json';
import { benchmarkBundleSchema } from '@/features/experiments/lib/benchmark-run.schema';
import { resolveExperiments } from '@/features/experiments/lib/resolve-experiments';
import type { Experiment } from '@/features/experiments/types/experiment';

let experiments: Experiment[] | undefined;

/** Bundled at build time (ADR 015), so parsed once per process. */
export function getExperiments(): Experiment[] {
  experiments ??= resolveExperiments(benchmarkBundleSchema.parse(bundle));

  return experiments;
}
