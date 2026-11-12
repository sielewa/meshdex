import type { ObjectMetadata } from './object-metadata.interface';
import type { UploadedPart } from './uploaded-part.interface';

/**
 * What asset-service needs from object storage. The S3 adapter implements it for
 * AWS and for the local SeaweedFS (only the endpoint differs); unit tests use fakes.
 * Bytes never pass through the service: clients upload parts to presigned URLs.
 * Injected with the `OBJECT_STORAGE` token (`storage.tokens.ts`).
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

  /**
   * Signs a GET URL for a stored object; signing is local (no network call), so signing
   * many URLs costs no storage requests. The URL doesn't check that the object exists.
   */
  presignDownload(key: string, expiresInSeconds: number): Promise<string>;

  /**
   * Signs a single-request PUT URL; the Content-Type is part of the signature, so the
   * client must send exactly `contentType` and the object is stored with it.
   */
  presignPut(key: string, contentType: string, expiresInSeconds: number): Promise<string>;

  /** Returns null when the object doesn't exist. */
  headObject(key: string): Promise<ObjectMetadata | null>;

  /** Deletes an object. Idempotent: a missing object is not an error. */
  deleteObject(key: string): Promise<void>;
}
