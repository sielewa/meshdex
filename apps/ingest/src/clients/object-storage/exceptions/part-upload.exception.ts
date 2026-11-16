import { SIGNATURE_REJECTED_STATUS, TRANSIENT_STATUSES } from '../object-storage.constants';

/** A part PUT failed; `status` is the HTTP status, 0 for network errors and timeouts. */
export class PartUploadException extends Error {
  constructor(
    message: string,
    readonly status: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }

  /** Worth retrying with the same URL. */
  get isTransient(): boolean {
    return this.status === 0 || TRANSIENT_STATUSES.includes(this.status);
  }

  /** The URL expired or its signature was rejected: retry with a freshly signed one. */
  get isSignatureRejected(): boolean {
    return this.status === SIGNATURE_REJECTED_STATUS;
  }
}
