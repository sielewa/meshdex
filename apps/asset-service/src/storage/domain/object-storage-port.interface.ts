import type { ObjectMetadata } from './object-metadata.interface';
import type { UploadedPart } from './uploaded-part.interface';

/** Bytes never pass through the service: clients upload to presigned URLs. */
export interface ObjectStorage {
  createMultipartUpload(key: string, contentType: string): Promise<string>;

  /** Local signing, no network call. */
  presignUploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    expiresInSeconds: number,
  ): Promise<string>;

  /**
   * @throws StorageUploadNotFoundException already completed or aborted
   * @throws StoragePartsRejectedException a part is missing or an ETag doesn't match
   */
  completeMultipartUpload(key: string, uploadId: string, parts: UploadedPart[]): Promise<void>;

  /** Idempotent: an unknown upload is not an error. */
  abortMultipartUpload(key: string, uploadId: string): Promise<void>;

  /** Local signing; doesn't check that the object exists. */
  presignDownload(key: string, expiresInSeconds: number): Promise<string>;

  /** The Content-Type is signed, so the client must send exactly `contentType`. */
  presignPut(key: string, contentType: string, expiresInSeconds: number): Promise<string>;

  headObject(key: string): Promise<ObjectMetadata | null>;

  /** Idempotent: a missing object is not an error. */
  deleteObject(key: string): Promise<void>;
}
