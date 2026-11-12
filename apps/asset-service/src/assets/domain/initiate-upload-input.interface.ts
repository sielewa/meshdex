export interface InitiateUploadInput {
  title: string;
  tags: string[];
  fileName: string;
  contentType: string;
  sizeBytes: number;
}
