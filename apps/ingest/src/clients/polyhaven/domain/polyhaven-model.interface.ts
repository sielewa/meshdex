export interface PolyhavenModel {
  id: string;
  name: string;
  tags: string[];
  categories: string[];
  authors: string[];
  /** Changes with the files; lets a re-run skip models already cached. */
  filesHash: string | null;
  /** Carries a version, so a new render means a new URL (ADR 017). */
  previewUrl: string | null;
}
