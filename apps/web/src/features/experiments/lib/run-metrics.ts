import type { BenchmarkRecord } from '@/features/experiments/lib/benchmark-run.schema';

/** One number taken from every run of a configuration and compared across configurations. */
export interface RunMetric {
  id: string;
  label: string;
  unit: string;
  /** Which direction is an improvement. */
  better: 'lower' | 'higher';
  description: string;
  value: (record: BenchmarkRecord) => number;
}

/** SI megabytes, the unit ingest reports throughput in (and `formatBytes` uses). */
const MB = 1_000_000;

export const RUN_METRICS: readonly RunMetric[] = [
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
    value: (record) => record.measurements.peakRssBytes / MB,
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
];
