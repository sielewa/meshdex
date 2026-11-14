import type { BenchmarkRecord } from '@/features/experiments/lib/benchmark-run.schema';
import type { RunMetric, RunSetting } from '@/features/experiments/types/run-profile';

/** The machine a run was measured on; runs from different machines are never compared. */
export interface Machine {
  platform: string;
  arch: string;
  cpuModel: string;
  cpuCount: number;
  totalMemoryBytes: number;
}

/** One run as a chart needs it. */
export interface WorkloadRun {
  file: string;
  startedAt: string;
  /** Metric id → value. */
  values: Readonly<Record<string, number>>;
}

/** Runs that did the same work the same way, from the same code. */
export interface RunConfiguration {
  key: string;
  /** Distinct labels of its runs, in the order they were recorded. */
  labels: string[];
  /** Options, runtime versions and the code, in the order they are named. */
  settings: RunSetting[];
  gitCommit: string | null;
  gitDirty: boolean | null;
  /** Oldest first. */
  runs: WorkloadRun[];
}

/** The same work on the same machine, done by one or more configurations. */
export interface Workload {
  key: string;
  command: BenchmarkRecord['command'];
  /** "Import · 1k textures · first 50 models". */
  title: string;
  /** "65.2 MB uploaded per run". */
  detail: string;
  order: number[];
  machine: Machine;
  metrics: readonly RunMetric[];
  /** In the order they were first recorded, or along the swept setting. */
  configurations: RunConfiguration[];
  /** Ids of the settings whose values differ between the configurations: what this workload compares. */
  differences: string[];
}
