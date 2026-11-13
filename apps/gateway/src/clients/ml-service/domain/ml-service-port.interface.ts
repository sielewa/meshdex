import type { SearchResult } from './search-result.interface';

/**
 * What the gateway needs from ml-service, in domain terms. The gRPC adapter is the only
 * implementation; proto types never leak past it. Failures surface as the exceptions in
 * `../exceptions`.
 */
export interface MlServicePort {
  /** Asset ids ranked by how well their images match `query`; at most `limit` (1-100). */
  searchAssets(query: string, limit: number): Promise<SearchResult>;
}
