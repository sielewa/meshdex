import type { SearchHit } from './search-hit.interface';

export interface SearchResult {
  /** Best match first. */
  hits: SearchHit[];
  /** The model that ranked the hits; scores of different models aren't comparable. */
  model: string;
}
