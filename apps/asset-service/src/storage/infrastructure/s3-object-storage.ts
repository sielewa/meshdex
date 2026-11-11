import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  HeadObjectCommand,
  S3ServiceException,
  UploadPartCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  StoragePartsRejectedException,
  StorageUploadNotFoundException,
  type ObjectMetadata,
  type ObjectStorage,
  type UploadedPart,
} from '../domain/object-storage-port.interface';

function isS3Error(error: unknown, ...names: string[]): boolean {
  return error instanceof S3ServiceException && names.includes(error.name);
}

export class S3ObjectStorage implements ObjectStorage {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}

  async createMultipartUpload(key: string, contentType: string): Promise<string> {
    const result = await this.client.send(
      new CreateMultipartUploadCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
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
            Parts: parts.map((part) => ({ PartNumber: part.partNumber, ETag: part.etag })),
          },
        }),
      );
    } catch (error) {
      if (isS3Error(error, 'NoSuchUpload')) {
        throw new StorageUploadNotFoundException(`Multipart upload for ${key} no longer exists`);
      }

      if (isS3Error(error, 'InvalidPart', 'InvalidPartOrder', 'EntityTooSmall')) {
        throw new StoragePartsRejectedException(error instanceof Error ? error.message : key);
      }

      throw error;
    }
  }

  async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    try {
      await this.client.send(
        new AbortMultipartUploadCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId }),
      );
    } catch (error) {
      if (!isS3Error(error, 'NoSuchUpload')) {
        throw error;
      }
    }
  }

  async headObject(key: string): Promise<ObjectMetadata | null> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );

      return { sizeBytes: result.ContentLength ?? 0, contentType: result.ContentType ?? null };
    } catch (error) {
      if (isS3Error(error, 'NotFound', 'NoSuchKey')) {
        return null;
      }

      throw error;
    }
  }
}
