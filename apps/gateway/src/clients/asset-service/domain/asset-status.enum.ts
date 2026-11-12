/** Status of an asset version as the gateway sees it (proto's UNSPECIFIED never reaches here). */
export enum AssetStatus {
  UPLOADING = 'uploading',
  UPLOADED = 'uploaded',
  PROCESSING = 'processing',
  READY = 'ready',
  FAILED = 'failed',
}
