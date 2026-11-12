import type {
  BenchmarkBundle,
  BenchmarkRun,
} from '@/features/experiments/lib/benchmark-run.schema';
import { groupRuns } from '@/features/experiments/lib/group-runs';
import type { Experiment } from '@/features/experiments/types/experiment';

/**
 * Joins the manifest with the runs (ADR 016): each experiment gets exactly the runs it lists,
 * grouped into workloads. Runs are grouped per experiment, never across experiments, so a
 * comparison contains only the runs recorded for its question. A listed file that doesn't
 * exist or a repeated id is a broken manifest and throws, which fails the build.
 */
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
