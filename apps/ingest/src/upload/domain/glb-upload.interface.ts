/** What `UploadService` turns into an asset. */
export interface GlbUpload {
  title: string;
  tags: string[];
  fileName: string;
  glb: Uint8Array;
}
