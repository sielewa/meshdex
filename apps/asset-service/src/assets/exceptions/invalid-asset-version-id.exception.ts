/**
 * The version id is not a UUID, so no such version can exist. Checked before any query:
 * Postgres would otherwise reject the value for the `uuid` column (22P02) and the caller
 * would get INTERNAL instead of INVALID_ARGUMENT.
 */
export class InvalidAssetVersionIdException extends Error {}
