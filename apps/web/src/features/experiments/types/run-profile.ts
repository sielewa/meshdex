import type { BenchmarkRecord } from '@/features/experiments/lib/benchmark-run.schema';
import type { Machine } from '@/features/experiments/types/workload';

/** A setting's value; only numbers can be swept. */
export type SettingValue = string | number | boolean | null;

/** A setting a run was made with (an option, the runtime or the code), as the page compares it. */
export interface RunSetting {
  id: string;
  /** What the setting is, for "Compares …" and a sweep's axis ("uploaders"). */
  name: string;
  value: SettingValue;
  /** The value as part of a configuration's name ("4 uploaders"). */
  text: string;
  /**
   * Options name a configuration; the runtime and the code appear in a name only when they
   * differ between the configurations of a workload.
   */
  kind: 'option' | 'runtime' | 'code';
}

/** One number taken from every run of a configuration and compared across configurations. */
export interface RunMetric {
  id: string;
  label: string;
  unit: string;
  /** Which direction is an improvement. */
  better: 'lower' | 'higher';
  description: string;
}

/** A metric of one command with the way to read it from that command's records. */
export interface RunMetricSpec<R extends BenchmarkRecord> extends RunMetric {
  value: (record: R) => number;
}

/**
 * How the page reads the records of one command: what counts as the same work, which
 * settings tell configurations apart and which numbers are compared. Adding a command to the
 * Experiments page means writing one of these.
 */
export interface CommandProfile<R extends BenchmarkRecord> {
  /** Values that define the data a run worked on; equal values mean the same work. */
  work: (record: R) => readonly unknown[];
  /** "Import · 1k textures · first 50 models". */
  workloadTitle: (record: R) => string;
  /** "65.2 MB uploaded per run". */
  workloadDetail: (record: R) => string;
  /** Sorts the workloads of this command, compared element by element. */
  workloadOrder: (record: R) => number[];
  /** Options and runtime versions, in the order they are named; the code is added for every command. */
  settings: (record: R) => RunSetting[];
  metrics: readonly RunMetricSpec<R>[];
}

/** What the page needs from one run, whatever command recorded it. */
export interface RunProfile {
  command: BenchmarkRecord['command'];
  work: readonly unknown[];
  workloadTitle: string;
  workloadDetail: string;
  workloadOrder: number[];
  machine: Machine;
  settings: RunSetting[];
  gitCommit: string | null;
  gitDirty: boolean | null;
  metrics: readonly RunMetric[];
  /** Metric id → this run's value. */
  values: Readonly<Record<string, number>>;
}
