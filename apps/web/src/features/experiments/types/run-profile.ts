import type { BenchmarkRecord } from '@/features/experiments/lib/benchmark-run.schema';
import type { Machine } from '@/features/experiments/types/workload';

/** A setting's value; only numbers can be swept. */
export type SettingValue = string | number | boolean | null;

export interface RunSetting {
  id: string;
  name: string;
  value: SettingValue;
  text: string;
  /**
   * Options name a configuration; the runtime and the code appear in a name only when they
   * differ between the configurations of a workload.
   */
  kind: 'option' | 'runtime' | 'code';
}

export interface RunMetric {
  id: string;
  label: string;
  unit: string;
  better: 'lower' | 'higher';
  description: string;
}

export interface RunMetricSpec<R extends BenchmarkRecord> extends RunMetric {
  value: (record: R) => number;
}

/** Adding a command to the Experiments page means writing one of these. */
export interface CommandProfile<R extends BenchmarkRecord> {
  /** Values that define the data a run worked on; equal values mean the same work. */
  work: (record: R) => readonly unknown[];
  /** "Import · 1k textures · first 50 models". */
  workloadTitle: (record: R) => string;
  /** "65.2 MB uploaded per run". */
  workloadDetail: (record: R) => string;
  workloadOrder: (record: R) => number[];
  /** The code version is added for every command. */
  settings: (record: R) => RunSetting[];
  metrics: readonly RunMetricSpec<R>[];
}

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
  values: Readonly<Record<string, number>>;
}
