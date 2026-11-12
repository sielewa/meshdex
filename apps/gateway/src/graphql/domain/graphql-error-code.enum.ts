/**
 * Values of `extensions.code` in GraphQL errors — a public contract clients branch on.
 * Values are UPPER_CASE (unlike other enums) because that is the wire format Apollo and
 * GraphQL clients use (`BAD_USER_INPUT`, `INTERNAL_SERVER_ERROR`).
 */
export enum GraphqlErrorCode {
  BAD_USER_INPUT = 'BAD_USER_INPUT',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
}
