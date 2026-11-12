/** A failed part upload; `status` is the HTTP status, 0 for network errors. */
export class PartUploadError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'PartUploadError';
  }

  /** The presigned URL expired (or was rejected): a fresh URL may succeed. */
  get isSignatureRejected(): boolean {
    return this.status === 403;
  }

  /** Network failures and server errors can succeed on a later attempt. */
  get isTransient(): boolean {
    return this.status === 0 || this.status === 408 || this.status === 429 || this.status >= 500;
  }
}
