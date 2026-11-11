export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

export interface UploadedPart {
  /** 1-based, as in S3. */
  partNumber: number;
  etag: string;
}

export interface ObjectMetadata {
  sizeBytes: number;
  contentType: string | null;
}

/**
 * What asset-service needs from object storage. The S3 adapter implements it for
 * AWS and for the local SeaweedFS (only the endpoint differs); unit tests use fakes.
 * Bytes never pass through the service: clients upload parts to presigned URLs.
 */
export interface ObjectStorage {
  /** Starts a multipart upload and returns its storage-side id. */
  createMultipartUpload(key: string, contentType: string): Promise<string>;

  /** Signs a PUT URL for one part; signing is local (no network call). */
  presignUploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    expiresInSeconds: number,
  ): Promise<string>;

  /**
   * Assembles the parts into one object.
   * @throws StorageUploadNotFoundException when the upload no longer exists (already completed or aborted)
   * @throws StoragePartsRejectedException when a part is missing or an ETag doesn't match
   */
  completeMultipartUpload(key: string, uploadId: string, parts: UploadedPart[]): Promise<void>;

  /** Frees stored parts. Idempotent: an unknown upload is not an error. */
  abortMultipartUpload(key: string, uploadId: string): Promise<void>;

  /** Returns null when the object doesn't exist. */
  headObject(key: string): Promise<ObjectMetadata | null>;
}

export class StorageUploadNotFoundException extends Error {}

export class StoragePartsRejectedException extends Error {}
