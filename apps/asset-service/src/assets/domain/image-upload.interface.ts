/** An image a client is about to upload, as declared before any byte is sent. */
export interface ImageUpload {
  contentType: string;
  sizeBytes: number;
}
