import type {
  BenchmarkBundle,
  BenchmarkRun,
} from '@/features/experiments/lib/benchmark-run.schema';
import { groupRuns } from '@/features/experiments/lib/group-runs';
import type { Experiment } from '@/features/experiments/types/experiment';

/** Grouped per experiment, never across, so a comparison holds only its own runs (ADR 016). */
export function resolveExperiments({ experiments, runs }: BenchmarkBundle): Experiment[] {
  const runsByFile = new Map(runs.map((run) => [run.file, run]));
  const ids = new Set<string>();

  return experiments.experiments.map((definition) => {
    if (ids.has(definition.id)) {
      throw new Error(`Experiment "${definition.id}" is defined twice`);
    }

    ids.add(definition.id);

    const experimentRuns = definition.runs.map((file): BenchmarkRun => {
      const run = runsByFile.get(file);

      if (run === undefined) {
        throw new Error(`Experiment "${definition.id}" lists ${file}, which is not a recorded run`);
      }

      return run;
    });

    return { definition, workloads: groupRuns(experimentRuns) };
  });
}
