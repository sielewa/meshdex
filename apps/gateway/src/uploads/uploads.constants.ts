/** S3's limit on parts per multipart upload; a request with more can never be valid. */
export const MAX_UPLOAD_PARTS = 10_000;
