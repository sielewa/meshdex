/** A model in Poly Haven's catalog, with the metadata ingest keeps. */
export interface PolyhavenModel {
  /** Poly Haven's slug, e.g. `ArmChair_01`. */
  id: string;
  name: string;
  tags: string[];
  categories: string[];
  authors: string[];
  /** Changes whenever the model's files change; lets a re-run skip models already cached. */
  filesHash: string | null;
  /**
   * The authors' render of the model at `POLYHAVEN_PREVIEW_SIZE_PX` as WebP (ADR 017); null when
   * the catalog lists none. The URL carries a version, so a new render means a new URL.
   */
  previewUrl: string | null;
}
