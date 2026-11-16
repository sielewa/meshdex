import type { ImportSummary } from './import-summary.interface';

export interface ImportRunResult extends Omit<ImportSummary, 'durationMs'> {
  modelsPerSecond: number;
  megabytesPerSecond: number;
}
