import type { ModelFailure } from './model-failure.interface';

/** Outcome of one `ingest fetch` run. */
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
