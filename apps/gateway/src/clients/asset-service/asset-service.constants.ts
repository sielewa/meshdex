/** Same limit as asset-service's BatchGetAssets (see asset.proto); DataLoader splits bigger batches. */
export const MAX_BATCH_GET_IDS = 100;
/** Same limit as asset-service's GetOriginalDownloadUrls. */
export const MAX_DOWNLOAD_URL_IDS = 100;
/** Attempts per call including the first; grpc-js caps it at 5. */
export const RETRY_MAX_ATTEMPTS = 3;
export const RETRY_INITIAL_BACKOFF = '0.1s';
export const RETRY_MAX_BACKOFF = '1s';
export const RETRY_BACKOFF_MULTIPLIER = 2;
