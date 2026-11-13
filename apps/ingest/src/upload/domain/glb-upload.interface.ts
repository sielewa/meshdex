/** What `UploadService` turns into an asset. */
export interface GlbUpload {
  title: string;
  tags: string[];
  fileName: string;
  glb: Uint8Array;
  /** Uploaded with the model as its source preview (ADR 017); null for none. */
  sourcePreview: {
    bytes: Uint8Array;
    contentType: string;
  } | null;
}
