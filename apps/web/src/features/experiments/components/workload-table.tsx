import type { ReactNode } from 'react';
import { describeCommit, describeWorkload } from '@/features/experiments/lib/describe-runs';
import { formatMetricValue } from '@/features/experiments/lib/format-metric';
import { RUN_METRICS } from '@/features/experiments/lib/run-metrics';
import { summarize } from '@/features/experiments/lib/summarize';
import type { Workload } from '@/features/experiments/types/workload';

interface WorkloadTableProps {
  workload: Workload;
  /** Display name of each configuration, in the workload's order. */
  names: string[];
}

/** The charts' numbers as text: readable without hovering, by screen readers and in print. */
export function WorkloadTable({ workload, names }: WorkloadTableProps): ReactNode {
  const { configurations } = workload;

  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-left tabular-nums">
        <caption className="sr-only">{describeWorkload(workload)}: median (min–max)</caption>
        <thead>
          <tr className="border-b border-neutral-800 text-neutral-400">
            <th scope="col" className="py-2 pr-4 font-normal">
              Metric
            </th>
            {configurations.map((configuration, index) => (
              <th
                key={configuration.key}
                scope="col"
                className="py-2 pr-4 font-medium text-neutral-100"
              >
                {names[index]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-neutral-800">
            <th scope="row" className="py-2 pr-4 font-normal text-neutral-400">
              Runs · code
            </th>
            {configurations.map((configuration) => (
              <td key={configuration.key} className="py-2 pr-4">
                {configuration.runs.length} · {describeCommit(configuration)}
              </td>
            ))}
          </tr>
          {RUN_METRICS.map((metric) => (
            <tr key={metric.id} className="border-b border-neutral-800 last:border-0">
              <th scope="row" className="py-2 pr-4 font-normal text-neutral-400">
                {metric.label} ({metric.unit})
              </th>
              {configurations.map((configuration) => {
                const { median, min, max } = summarize(
                  configuration.runs.map((run) => metric.value(run.record)),
                );

                return (
                  <td key={configuration.key} className="py-2 pr-4">
                    <span className="text-neutral-100">{formatMetricValue(median)}</span>{' '}
                    <span className="text-neutral-500">
                      ({formatMetricValue(min)}–{formatMetricValue(max)})
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
