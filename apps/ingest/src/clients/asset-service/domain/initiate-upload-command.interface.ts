export interface InitiateUploadCommand {
  title: string;
  tags: string[];
  fileName: string;
  contentType: string;
  sizeBytes: number;
  /** An image uploaded with the model (ADR 017); null for none. */
  sourcePreview: {
    contentType: string;
    sizeBytes: number;
  } | null;
}
