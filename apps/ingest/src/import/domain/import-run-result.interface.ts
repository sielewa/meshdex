import type { ImportSummary } from './import-summary.interface';

/** `result` of a recorded import run: the summary plus throughput derived from wall time. */
export interface ImportRunResult extends Omit<ImportSummary, 'durationMs'> {
  modelsPerSecond: number;
  megabytesPerSecond: number;
}
