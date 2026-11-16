/** Checked before any query, where Postgres would fail on the uuid column and give INTERNAL. */
export class InvalidAssetVersionIdException extends Error {}
