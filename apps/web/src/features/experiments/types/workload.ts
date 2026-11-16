import type { BenchmarkRecord } from '@/features/experiments/lib/benchmark-run.schema';
import type { RunMetric, RunSetting } from '@/features/experiments/types/run-profile';

/** Runs from different machines are never compared. */
export interface Machine {
  platform: string;
  arch: string;
  cpuModel: string;
  cpuCount: number;
  totalMemoryBytes: number;
}

export interface WorkloadRun {
  file: string;
  startedAt: string;
  values: Readonly<Record<string, number>>;
}

export interface RunConfiguration {
  key: string;
  labels: string[];
  settings: RunSetting[];
  gitCommit: string | null;
  gitDirty: boolean | null;
  runs: WorkloadRun[];
}

export interface Workload {
  key: string;
  command: BenchmarkRecord['command'];
  title: string;
  detail: string;
  order: number[];
  machine: Machine;
  metrics: readonly RunMetric[];
  configurations: RunConfiguration[];
  /** Ids of the settings whose values differ between the configurations: what this workload compares. */
  differences: string[];
}
