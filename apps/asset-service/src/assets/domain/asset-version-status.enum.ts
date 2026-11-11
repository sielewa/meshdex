/**
 * Lifecycle of an asset version: UPLOADING -> UPLOADED -> PROCESSING -> READY | FAILED.
 * Stored as text (conventions: no native PG enums); transitions are enforced with
 * conditional updates (`WHERE status = <expected>`), so retries and races can't skip a step.
 */
export enum AssetVersionStatus {
  UPLOADING = 'uploading',
  UPLOADED = 'uploaded',
  PROCESSING = 'processing',
  READY = 'ready',
  FAILED = 'failed',
}

const KNOWN_STATUSES = new Set<string>(Object.values(AssetVersionStatus));

/** Type guard: narrows the type only when the runtime check passed (no blind `as`). */
function isAssetVersionStatus(value: string): value is AssetVersionStatus {
  return KNOWN_STATUSES.has(value);
}

/** Narrows a status read from the database; an unknown value means corrupted data, not user error. */
export function parseAssetVersionStatus(value: string): AssetVersionStatus {
  if (!isAssetVersionStatus(value)) {
    throw new Error(`Unknown asset version status in database: "${value}"`);
  }

  return value;
}
