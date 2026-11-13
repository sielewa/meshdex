/**
 * Stores bytes in object storage through presigned URLs handed out by asset-service, so
 * ingest never holds storage credentials. Failures surface as `PartUploadException`.
 */
export interface PresignedUploadPort {
  /** PUTs one part and returns the ETag storage assigned to it. */
  putPart(url: string, body: Uint8Array, signal: AbortSignal): Promise<string>;

  /**
   * PUTs a whole small object (a preview image). `contentType` must be the one the URL was
   * signed with: asset-service signs it, so storage keeps the declared type.
   */
  putObject(url: string, body: Uint8Array, contentType: string, signal: AbortSignal): Promise<void>;
}
