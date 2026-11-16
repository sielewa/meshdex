/** As in ml.proto. */
export const MAX_SEARCH_LIMIT = 100;
/** As in ml-service (ADR 019). */
export const MAX_SEARCH_QUERY_LENGTH = 500;
/** Attempts per call including the first; grpc-js caps it at 5. */
export const RETRY_MAX_ATTEMPTS = 3;
export const RETRY_INITIAL_BACKOFF = '0.1s';
export const RETRY_MAX_BACKOFF = '1s';
export const RETRY_BACKOFF_MULTIPLIER = 2;
