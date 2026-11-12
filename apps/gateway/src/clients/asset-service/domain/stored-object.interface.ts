/**
 * A file in object storage. `key` stays inside the gateway: it is turned into a URL
 * (or not exposed at all) when the file is shown to clients.
 */
export interface StoredObject {
  key: string;
  sizeBytes: number;
  contentType: string;
}
