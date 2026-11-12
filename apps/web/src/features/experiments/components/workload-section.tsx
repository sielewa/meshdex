import type { ReactNode } from 'react';
import { RunDotPlot } from '@/features/experiments/components/run-dot-plot';
import { WorkloadTable } from '@/features/experiments/components/workload-table';
import { SERIES_COLORS, SERIES_OVERFLOW_COLOR } from '@/features/experiments/experiments.constants';
import {
  describeCommit,
  describeConfiguration,
  describeDifferences,
  describeMachine,
  describeWorkload,
} from '@/features/experiments/lib/describe-runs';
import { formatMetricValue } from '@/features/experiments/lib/format-metric';
import { RUN_METRICS } from '@/features/experiments/lib/run-metrics';
import { summarize } from '@/features/experiments/lib/summarize';
import type { ConfigurationField, Workload } from '@/features/experiments/types/workload';
import { formatBytes } from '@/lib/format-bytes';

const ALL_FIELDS: ConfigurationField[] = [
  'packConcurrency',
  'packInWorkers',
  'uploadConcurrency',
  'queueSize',
  'node',
  'gitCommit',
];

const runTime = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'medium',
  timeZone: 'UTC',
});

/** One workload: what was compared, a dot plot per metric and the same numbers as a table. */
export function WorkloadSection({ workload }: { workload: Workload }): ReactNode {
  const { configurations, differences } = workload;
  const first = configurations[0];

  // groupRuns never returns an empty workload; the guard only satisfies the type.
  if (first === undefined) {
    return null;
  }

  const firstRun = first.runs[0]?.record;
  const sharedFields = ALL_FIELDS.filter((field) => !differences.includes(field));
  const series = configurations.map((configuration, index) => ({
    configuration,
    name: describeConfiguration(configuration, differences),
    color: SERIES_COLORS[index] ?? SERIES_OVERFLOW_COLOR,
  }));

  return (
    <section
      className="space-y-5 rounded-lg bg-neutral-900 p-5"
      aria-label={describeWorkload(workload)}
    >
      <header className="space-y-1">
        <h2 className="text-lg font-semibold">{describeWorkload(workload)}</h2>
        {firstRun && (
          <p className="text-sm text-neutral-400">
            {formatBytes(firstRun.result.bytesUploaded)} uploaded per run ·{' '}
            {describeMachine(workload)}
          </p>
        )}
        <p className="text-sm text-neutral-400">
          {differences.length > 0 ? (
            <>
              Compares <span className="text-neutral-200">{describeDifferences(differences)}</span>;
              the same in every run: {describeConfiguration(first, sharedFields)}
            </>
          ) : (
            <>One configuration: {describeConfiguration(first, [])}</>
          )}
        </p>
      </header>

      <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm" aria-label="Configurations">
        {series.map(({ configuration, name, color }) => (
          <li key={configuration.key} className="flex items-center gap-2">
            <svg width="10" height="10" aria-hidden="true">
              <circle cx="5" cy="5" r="4" style={{ fill: color }} />
            </svg>
            <span className="text-neutral-100">{name}</span>
            <span className="text-neutral-500">
              {configuration.runs.length} runs · {describeCommit(configuration)}
            </span>
          </li>
        ))}
        <li className="flex items-center gap-2 text-neutral-500">
          <svg width="10" height="14" aria-hidden="true">
            <line
              x1="5"
              x2="5"
              y1="1"
              y2="13"
              strokeWidth="2"
              style={{ stroke: 'var(--chart-ink)' }}
            />
          </svg>
          median (value at the end of each row)
        </li>
      </ul>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {RUN_METRICS.map((metric) => (
          <RunDotPlot
            key={metric.id}
            title={metric.label}
            unit={metric.unit}
            better={metric.better}
            description={metric.description}
            rows={series.map(({ configuration, name, color }) => {
              const values = configuration.runs.map((run) => metric.value(run.record));

              return {
                key: configuration.key,
                name,
                color,
                summary: summarize(values),
                points: configuration.runs.map((run, index) => ({
                  key: run.file,
                  value: values[index] ?? 0,
                  title: `${name} · ${runTime.format(new Date(run.record.startedAt))} UTC · ${formatMetricValue(values[index] ?? 0)} ${metric.unit}`,
                })),
              };
            })}
          />
        ))}
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-neutral-400 hover:text-neutral-200">
          Table: median (min–max) of every metric
        </summary>
        <WorkloadTable workload={workload} names={series.map(({ name }) => name)} />
      </details>
    </section>
  );
}
