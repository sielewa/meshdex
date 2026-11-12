import type { ExperimentDefinition } from '@/features/experiments/lib/benchmark-run.schema';
import type { Workload } from '@/features/experiments/types/workload';

/** A question from the manifest with its runs, grouped into workloads. */
export interface Experiment {
  definition: ExperimentDefinition;
  workloads: Workload[];
}
