/** Transitions are conditional updates (`WHERE status = <expected>`), so races can't skip a step. */
export enum AssetVersionStatus {
  UPLOADING = 'uploading',
  UPLOADED = 'uploaded',
  PROCESSING = 'processing',
  READY = 'ready',
  FAILED = 'failed',
}
