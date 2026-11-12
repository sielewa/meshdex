import type {
  CONFIGURATION_OPTIONS,
  NUMERIC_CONFIGURATION_OPTIONS,
  WORKLOAD_OPTIONS,
} from '@/features/experiments/experiments.constants';
import type {
  BenchmarkRun,
  ImportRunOptions,
} from '@/features/experiments/lib/benchmark-run.schema';

export type WorkloadOption = (typeof WORKLOAD_OPTIONS)[number];
export type ConfigurationOption = (typeof CONFIGURATION_OPTIONS)[number];
export type NumericConfigurationOption = (typeof NUMERIC_CONFIGURATION_OPTIONS)[number];

/** A configuration property that can differ between configurations of one workload. */
export type ConfigurationField = ConfigurationOption | 'node' | 'gitCommit';

/** The machine a run was measured on; runs from different machines are never compared. */
export interface Machine {
  platform: string;
  arch: string;
  cpuModel: string;
  cpuCount: number;
  totalMemoryBytes: number;
}

/** Runs that did the same work the same way, from the same code. */
export interface RunConfiguration {
  key: string;
  /** Distinct labels of its runs, in the order they were recorded. */
  labels: string[];
  options: Pick<ImportRunOptions, ConfigurationOption>;
  node: string;
  gitCommit: string | null;
  gitDirty: boolean | null;
  /** Oldest first. */
  runs: BenchmarkRun[];
}

/** The same work on the same machine, done by one or more configurations. */
export interface Workload {
  key: string;
  command: 'import';
  options: Pick<ImportRunOptions, WorkloadOption>;
  machine: Machine;
  /** In the order they were first recorded. */
  configurations: RunConfiguration[];
  /** Fields whose values differ between the configurations: what this workload compares. */
  differences: ConfigurationField[];
}
