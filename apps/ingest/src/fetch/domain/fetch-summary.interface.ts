import type { ModelFailure } from './model-failure.interface';

export interface FetchSummary {
  modelsSelected: number;
  modelsFetched: number;
  modelsUpToDate: number;
  modelsWithoutGltf: number;
  failures: ModelFailure[];
  filesDownloaded: number;
  bytesDownloaded: number;
  durationMs: number;
}
