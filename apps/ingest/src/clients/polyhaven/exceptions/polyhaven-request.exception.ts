/**
 * A Poly Haven request failed. `retryable` is true for network errors, timeouts,
 * rate limiting and 5xx responses; false for answers that won't change on a retry.
 */
export class PolyhavenRequestException extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}
