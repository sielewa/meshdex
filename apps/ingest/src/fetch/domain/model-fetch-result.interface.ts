import type { ModelFetchStatus } from './model-fetch-status.type';

export interface ModelFetchResult {
  status: ModelFetchStatus;
  filesDownloaded: number;
  bytesDownloaded: number;
}
