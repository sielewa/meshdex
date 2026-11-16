import type { SearchHit } from './search-hit.interface';

export interface SearchResult {
  hits: SearchHit[];
  /** Scores of different models aren't comparable. */
  model: string;
}
