import { S3Client } from '@aws-sdk/client-s3';
import { Module } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { s3Config } from '../config/config.namespaces';
import { OBJECT_STORAGE } from './storage.tokens';
import type { ObjectStorage } from './domain/object-storage-port.interface';
import { S3ObjectStorage } from './infrastructure/s3-object-storage';

@Module({
  providers: [
    {
      provide: OBJECT_STORAGE,
      inject: [
        s3Config.KEY,
      ],
      useFactory: (config: ConfigType<typeof s3Config>): ObjectStorage =>
        new S3ObjectStorage(
          new S3Client({
            endpoint: config.endpoint,
            region: config.region,
            forcePathStyle: config.forcePathStyle,
            credentials: {
              accessKeyId: config.accessKeyId,
              secretAccessKey: config.secretAccessKey,
            },
            // Default CRC32 checksums would make presigned part URLs expect a checksum header from the
            // browser, and break SeaweedFS.
            requestChecksumCalculation: 'WHEN_REQUIRED',
            responseChecksumValidation: 'WHEN_REQUIRED',
          }),
          config.bucket,
        ),
    },
  ],
  exports: [
    OBJECT_STORAGE,
  ],
})
export class StorageModule {}
