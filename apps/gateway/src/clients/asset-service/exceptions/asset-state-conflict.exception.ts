/**
 * The operation doesn't fit the current state, e.g. completing an upload that was
 * already completed or aborted (FAILED_PRECONDITION); the message is safe for clients.
 */
export class AssetStateConflictException extends Error {}
