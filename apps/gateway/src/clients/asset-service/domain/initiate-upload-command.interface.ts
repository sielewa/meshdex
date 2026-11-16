export interface InitiateUploadCommand {
  title: string;
  tags: string[];
  fileName: string;
  contentType: string;
  sizeBytes: number;
}
