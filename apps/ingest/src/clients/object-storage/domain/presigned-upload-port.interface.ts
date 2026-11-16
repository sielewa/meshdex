/** Presigned URLs from asset-service, so ingest never holds storage credentials. */
export interface PresignedUploadPort {
  putPart(url: string, body: Uint8Array, signal: AbortSignal): Promise<string>;

  /** `contentType` must be the one the URL was signed with. */
  putObject(url: string, body: Uint8Array, contentType: string, signal: AbortSignal): Promise<void>;
}
