import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getExperiments } from '@/features/experiments/api/benchmark-runs';
import { ExperimentSection } from '@/features/experiments/components/experiment-section';

export const metadata: Metadata = { title: 'Experiments · Meshdex' };

/**
 * Engineering view (ADR 015, 016): the experiments and runs committed with this build. The
 * data is bundled at build time, so there is nothing to fetch.
 */
export default function ExperimentsPage(): ReactNode {
  const experiments = getExperiments();

  return (
    <div className="space-y-12">
      <header className="max-w-3xl space-y-2">
        <h1 className="text-2xl font-semibold">Experiments</h1>
        <p className="text-sm text-neutral-400">
          Internal performance measurements of how Meshdex loads and processes data. Each experiment
          answers one question; each dot is one recorded run, and only runs that did the same work
          on the same machine are compared. Method, environment and conclusions are in the reports
          in <code className="text-neutral-300">docs/benchmarks/</code> of the repository.
        </p>
      </header>
      {experiments.length === 0 ? (
        <p className="text-neutral-400">No experiments in this build.</p>
      ) : (
        experiments.map((experiment) => (
          <ExperimentSection key={experiment.definition.id} experiment={experiment} />
        ))
      )}
    </div>
  );
}
