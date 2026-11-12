/** Deadline of one part PUT; a 16 MiB part needs ~1 Mbit/s to make it. */
export const PART_UPLOAD_TIMEOUT_MS = 120_000;

/** Statuses worth retrying: timeouts, throttling and server errors. */
export const TRANSIENT_STATUSES: readonly number[] = [408, 429, 500, 502, 503, 504];

/** S3 answers 403 when a presigned URL expired (or its signature is otherwise rejected). */
export const SIGNATURE_REJECTED_STATUS = 403;
