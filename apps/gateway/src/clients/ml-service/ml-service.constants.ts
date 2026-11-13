/** Same limit as ml-service's SearchAssets (see ml.proto). */
export const MAX_SEARCH_LIMIT = 100;
/** Same limit as ml-service's SearchService (ADR 019): CLIP reads at most 77 tokens anyway. */
export const MAX_SEARCH_QUERY_LENGTH = 500;
/** Attempts per call including the first; grpc-js caps it at 5. */
export const RETRY_MAX_ATTEMPTS = 3;
export const RETRY_INITIAL_BACKOFF = '0.1s';
export const RETRY_MAX_BACKOFF = '1s';
export const RETRY_BACKOFF_MULTIPLIER = 2;
