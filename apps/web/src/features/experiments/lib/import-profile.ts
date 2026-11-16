import { IMPORT_RESOLUTION_ORDER, MEGABYTE } from '@/features/experiments/experiments.constants';
import type { ImportRecord } from '@/features/experiments/lib/benchmark-run.schema';
import type { CommandProfile } from '@/features/experiments/types/run-profile';
import { formatBytes } from '@/lib/format-bytes';

export const IMPORT_PROFILE: CommandProfile<ImportRecord> = {
  work: ({ options }) => [options.resolution, options.limit, sortedIds(options.ids)],

  workloadTitle: ({ options }) => {
    const models =
      options.ids !== null
        ? `${String(options.ids.length)} chosen models`
        : options.limit !== null
          ? `first ${String(options.limit)} models`
          : 'all cached models';

    return `Import · ${options.resolution} textures · ${models}`;
  },

  workloadDetail: ({ result }) => `${formatBytes(result.bytesUploaded)} uploaded per run`,

  // All models last.
  workloadOrder: ({ options }) => [
    IMPORT_RESOLUTION_ORDER.indexOf(options.resolution),
    options.limit ?? Infinity,
  ],

  settings: ({ options, environment }) => [
    {
      id: 'packConcurrency',
      name: 'packers',
      value: options.packConcurrency,
      text: `${String(options.packConcurrency)} packers`,
      kind: 'option',
    },
    {
      id: 'packInWorkers',
      name: 'where packing runs',
      value: options.packInWorkers,
      text: options.packInWorkers ? 'worker threads' : 'main thread',
      kind: 'option',
    },
    {
      id: 'uploadConcurrency',
      name: 'uploaders',
      value: options.uploadConcurrency,
      text: `${String(options.uploadConcurrency)} uploaders`,
      kind: 'option',
    },
    {
      id: 'queueSize',
      name: 'queue size',
      value: options.queueSize,
      text: `queue ${String(options.queueSize)}`,
      kind: 'option',
    },
    {
      id: 'node',
      name: 'Node.js version',
      value: environment.node,
      text: `Node ${environment.node}`,
      kind: 'runtime',
    },
  ],

  metrics: [
    {
      id: 'wall-time',
      label: 'Wall time',
      unit: 'ms',
      better: 'lower',
      description: 'Whole command, start-up of worker threads included.',
      value: (record) => record.measurements.wallMs,
    },
    {
      id: 'throughput',
      label: 'Throughput',
      unit: 'MB/s',
      better: 'higher',
      description: 'Bytes uploaded per second of wall time.',
      value: (record) => record.result.megabytesPerSecond,
    },
    {
      id: 'cpu-time',
      label: 'CPU time',
      unit: 'ms',
      better: 'lower',
      description: 'User plus system time of the whole process, all threads.',
      value: (record) => record.measurements.cpuUserMs + record.measurements.cpuSystemMs,
    },
    {
      id: 'peak-rss',
      label: 'Peak RSS',
      unit: 'MB',
      better: 'lower',
      description: 'Highest resident memory of the process, sampled during the run.',
      value: (record) => record.measurements.peakRssBytes / MEGABYTE,
    },
    {
      id: 'event-loop-delay-p99',
      label: 'Event-loop delay p99',
      unit: 'ms',
      better: 'lower',
      description: 'How late the main thread ran timers, 99th percentile.',
      value: (record) => record.measurements.eventLoopDelayMs.p99,
    },
    {
      id: 'event-loop-delay-max',
      label: 'Event-loop delay max',
      unit: 'ms',
      better: 'lower',
      description: 'The longest the main thread was blocked.',
      value: (record) => record.measurements.eventLoopDelayMs.max,
    },
  ],
};

/** The same ids in another order are the same work. */
function sortedIds(ids: readonly string[] | null): string[] | null {
  return ids === null ? null : [...ids].sort();
}
