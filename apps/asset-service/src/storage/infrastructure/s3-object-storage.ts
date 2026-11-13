import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3ServiceException,
  UploadPartCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StoragePartsRejectedException } from '../exceptions/storage-parts-rejected.exception';
import { StorageUploadNotFoundException } from '../exceptions/storage-upload-not-found.exception';
import type { ObjectMetadata } from '../domain/object-metadata.interface';
import type { ObjectStorage } from '../domain/object-storage-port.interface';
import type { UploadedPart } from '../domain/uploaded-part.interface';

export class S3ObjectStorage implements ObjectStorage {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}

  async createMultipartUpload(key: string, contentType: string): Promise<string> {
    const result = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
      }),
    );

    if (!result.UploadId) {
      throw new Error(`Object storage returned no UploadId for ${key}`);
    }

    return result.UploadId;
  }

  presignUploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    expiresInSeconds: number,
  ): Promise<string> {
    return getSignedUrl(
      this.client,
      new UploadPartCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
      }),
      { expiresIn: expiresInSeconds },
    );
  }

  async completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: UploadedPart[],
  ): Promise<void> {
    try {
      await this.client.send(
        new CompleteMultipartUploadCommand({
          Bucket: this.bucket,
          Key: key,
          UploadId: uploadId,
          MultipartUpload: {
            Parts: parts.map((part) => ({
              PartNumber: part.partNumber,
              ETag: part.etag,
            })),
          },
        }),
      );
    } catch (error) {
      if (this.isS3Error(error, 'NoSuchUpload')) {
        throw new StorageUploadNotFoundException(`Multipart upload for ${key} no longer exists`);
      }

      if (this.isS3Error(error, 'InvalidPart', 'InvalidPartOrder', 'EntityTooSmall')) {
        throw new StoragePartsRejectedException(error instanceof Error ? error.message : key);
      }

      throw error;
    }
  }

  async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    try {
      await this.client.send(
        new AbortMultipartUploadCommand({
          Bucket: this.bucket,
          Key: key,
          UploadId: uploadId,
        }),
      );
    } catch (error) {
      if (!this.isS3Error(error, 'NoSuchUpload')) {
        throw error;
      }
    }
  }

  presignDownload(key: string, expiresInSeconds: number): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
      { expiresIn: expiresInSeconds },
    );
  }

  presignPut(key: string, contentType: string, expiresInSeconds: number): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
      }),
      {
        expiresIn: expiresInSeconds,
        // Sign the header instead of leaving it free: a client can't store the image under
        // another type (e.g. text/html) than the one validated at InitiateUpload.
        signableHeaders: new Set(['content-type']),
      },
    );
  }

  async deleteObject(key: string): Promise<void> {
    // S3 answers 204 for a missing key too, so this is idempotent without special cases.
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }

  async headObject(key: string): Promise<ObjectMetadata | null> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );

      return {
        sizeBytes: result.ContentLength ?? 0,
        contentType: result.ContentType ?? null,
      };
    } catch (error) {
      if (this.isS3Error(error, 'NotFound', 'NoSuchKey')) {
        return null;
      }

      throw error;
    }
  }

  private isS3Error(error: unknown, ...names: string[]): boolean {
    return error instanceof S3ServiceException && names.includes(error.name);
  }
}
