import type { SearchResult } from './search-result.interface';

export interface MlServicePort {
  /** `limit` 1-100. */
  searchAssets(query: string, limit: number): Promise<SearchResult>;
}
