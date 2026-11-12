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
