import type { ImageUpload } from './image-upload.interface';

export interface InitiateUploadInput {
  title: string;
  tags: string[];
  fileName: string;
  contentType: string;
  sizeBytes: number;
  sourcePreview: ImageUpload | null;
}
