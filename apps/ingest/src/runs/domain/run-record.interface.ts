import type { RunEnvironment } from './run-environment.interface';
import type { RunMeasurements } from './run-measurements.interface';

/** One run written as JSON by `--record`: the input of benchmark reports. */
export interface RunRecord<TOptions, TResult> {
  version: number;
  command: string;
  label: string | null;
  /** ISO 8601. */
  startedAt: string;
  options: TOptions;
  environment: RunEnvironment;
  measurements: RunMeasurements;
  result: TResult;
}
