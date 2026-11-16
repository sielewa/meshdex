/** `status` 0 means a network error. */
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

  get isTransient(): boolean {
    return this.status === 0 || this.status === 408 || this.status === 429 || this.status >= 500;
  }
}
