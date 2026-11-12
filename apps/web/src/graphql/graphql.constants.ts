/**
 * `extensions.code` values the gateway returns (ADR 009). Only these are part of the API
 * contract; anything else is treated as an unexpected failure.
 */
export const GRAPHQL_ERROR_CODES = {
  BAD_USER_INPUT: 'BAD_USER_INPUT',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
} as const;

/** Failures worth retrying: the request may succeed once the gateway or its upstream recovers. */
export const RETRYABLE_ERROR_CODES: readonly string[] = [GRAPHQL_ERROR_CODES.SERVICE_UNAVAILABLE];
