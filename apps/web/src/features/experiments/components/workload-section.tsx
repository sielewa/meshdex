import type { ReactNode } from 'react';
import { RunDotPlot } from '@/features/experiments/components/run-dot-plot';
import { SweepPlot } from '@/features/experiments/components/sweep-plot';
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
import { sweptOption } from '@/features/experiments/lib/group-runs';
import { RUN_METRICS, type RunMetric } from '@/features/experiments/lib/run-metrics';
import { summarize } from '@/features/experiments/lib/summarize';
import type {
  ConfigurationField,
  RunConfiguration,
  Workload,
} from '@/features/experiments/types/workload';
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

/**
 * One workload of an experiment: what was compared, a chart per metric and the same numbers as
 * a table. A sweep of one numeric option gets a line across its values; any other comparison
 * gets a dot plot with a row per configuration.
 */
export function WorkloadSection({ workload }: { workload: Workload }): ReactNode {
  const { configurations, differences } = workload;
  const first = configurations[0];

  // groupRuns never returns an empty workload; the guard only satisfies the type.
  if (first === undefined) {
    return null;
  }

  const firstRun = first.runs[0]?.record;
  const swept = sweptOption(workload);
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
        <h3 className="text-lg font-semibold">{describeWorkload(workload)}</h3>
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

      {swept === null ? (
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
      ) : (
        <p className="text-sm text-neutral-500">
          {describeRunCounts(configurations)} runs per value · dots are runs, the white mark and the
          line are the median; the best median is printed
        </p>
      )}

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {RUN_METRICS.map((metric) => {
          const rows = series.map(({ configuration, name, color }) =>
            toRow(configuration, name, color, metric),
          );

          return swept === null ? (
            <RunDotPlot
              key={metric.id}
              title={metric.label}
              unit={metric.unit}
              better={metric.better}
              description={metric.description}
              rows={rows}
            />
          ) : (
            <SweepPlot
              key={metric.id}
              title={metric.label}
              unit={metric.unit}
              better={metric.better}
              description={metric.description}
              axisLabel={describeDifferences([swept])}
              steps={rows.map((row, index) => ({
                ...row,
                label: String(configurations[index]?.options[swept] ?? ''),
              }))}
            />
          );
        })}
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

/** Points and summary of one configuration for one metric, shared by both chart kinds. */
function toRow(
  configuration: RunConfiguration,
  name: string,
  color: string,
  metric: RunMetric,
): {
  key: string;
  name: string;
  color: string;
  summary: ReturnType<typeof summarize>;
  points: { key: string; value: number; title: string }[];
} {
  const values = configuration.runs.map((run) => metric.value(run.record));

  return {
    key: configuration.key,
    name,
    color,
    summary: summarize(values),
    points: configuration.runs.map((run, index) => {
      const value = values[index] ?? 0;
      const time = runTime.format(new Date(run.record.startedAt));

      return {
        key: run.file,
        value,
        title: `${name} · ${time} UTC · ${formatMetricValue(value)} ${metric.unit}`,
      };
    }),
  };
}

/** "5", or "3–5" when configurations have different numbers of runs. */
function describeRunCounts(configurations: readonly RunConfiguration[]): string {
  const counts = configurations.map((configuration) => configuration.runs.length);
  const min = Math.min(...counts);
  const max = Math.max(...counts);

  return min === max ? String(min) : `${String(min)}–${String(max)}`;
}
