/** `retryable` only for UNAVAILABLE and DEADLINE_EXCEEDED; a rejected request isn't. */
export class AssetServiceRequestException extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}
