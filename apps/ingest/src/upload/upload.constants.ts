/** The only content type asset-service accepts. */
export const GLB_CONTENT_TYPE = 'model/gltf-binary';

/** Retries of one part PUT (transient errors, or an expired URL that is signed again). */
export const PART_RETRY_ATTEMPTS = 3;
export const PART_RETRY_BASE_DELAY_MS = 250;
export const PART_RETRY_MAX_DELAY_MS = 4_000;
