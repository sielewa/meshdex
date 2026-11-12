/**
 * An asset-service call failed. `retryable` is true when asset-service couldn't be reached
 * or didn't answer in time (UNAVAILABLE, DEADLINE_EXCEEDED); a rejected request (invalid
 * input, wrong state, unknown upload) is not.
 */
export class AssetServiceRequestException extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}
