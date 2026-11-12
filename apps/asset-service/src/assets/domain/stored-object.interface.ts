/** A file in object storage. */
export interface StoredObject {
  key: string;
  sizeBytes: number;
  contentType: string;
}
