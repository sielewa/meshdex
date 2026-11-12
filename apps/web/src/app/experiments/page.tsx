import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getBenchmarkRuns } from '@/features/experiments/api/benchmark-runs';
import { WorkloadSection } from '@/features/experiments/components/workload-section';
import { groupRuns } from '@/features/experiments/lib/group-runs';

export const metadata: Metadata = { title: 'Experiments · Meshdex' };

/**
 * Engineering view (ADR 015): the benchmark runs committed with this build, grouped into
 * workloads. The data is bundled at build time, so there is nothing to fetch and no
 * loading boundary is needed.
 */
export default function ExperimentsPage(): ReactNode {
  const workloads = groupRuns(getBenchmarkRuns());

  return (
    <div className="space-y-8">
      <header className="max-w-3xl space-y-2">
        <h1 className="text-2xl font-semibold">Experiments</h1>
        <p className="text-sm text-neutral-400">
          Internal performance measurements of how Meshdex loads and processes data. Each dot is one
          recorded run; runs that did the same work on the same machine are compared side by side.
          Method, environment and conclusions are in the reports in{' '}
          <code className="text-neutral-300">docs/benchmarks/</code> of the repository.
        </p>
      </header>
      {workloads.length === 0 ? (
        <p className="text-neutral-400">No recorded runs in this build.</p>
      ) : (
        workloads.map((workload) => <WorkloadSection key={workload.key} workload={workload} />)
      )}
    </div>
  );
}
