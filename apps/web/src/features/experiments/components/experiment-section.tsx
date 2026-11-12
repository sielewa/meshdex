import type { ReactNode } from 'react';
import { WorkloadSection } from '@/features/experiments/components/workload-section';
import type { Experiment } from '@/features/experiments/types/experiment';

/** One experiment from the manifest (ADR 016): its question, its answer, then its workloads. */
export function ExperimentSection({ experiment }: { experiment: Experiment }): ReactNode {
  const { definition, workloads } = experiment;

  return (
    <section className="space-y-5" aria-labelledby={`experiment-${definition.id}`}>
      <header className="max-w-3xl space-y-2">
        <h2 id={`experiment-${definition.id}`} className="text-xl font-semibold">
          {definition.title}
        </h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-neutral-500">Question</dt>
          <dd className="text-neutral-200">{definition.question}</dd>
          <dt className="text-neutral-500">Answer</dt>
          <dd className="text-neutral-200">{definition.answer ?? 'Not concluded yet.'}</dd>
          <dt className="text-neutral-500">Report</dt>
          <dd>
            <code className="text-neutral-300">docs/benchmarks/{definition.report}</code>
          </dd>
        </dl>
      </header>
      {workloads.map((workload) => (
        <WorkloadSection key={workload.key} workload={workload} />
      ))}
    </section>
  );
}
