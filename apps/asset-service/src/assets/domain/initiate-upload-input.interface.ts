import type { ImageUpload } from './image-upload.interface';

export interface InitiateUploadInput {
  title: string;
  tags: string[];
  fileName: string;
  contentType: string;
  sizeBytes: number;
  /** Optional image uploaded with the model (ADR 017). */
  sourcePreview: ImageUpload | null;
}
