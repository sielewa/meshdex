import { S3Client } from '@aws-sdk/client-s3';
import { Module } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { s3Config } from '../config/config.namespaces';
import { OBJECT_STORAGE, type ObjectStorage } from './domain/object-storage-port.interface';
import { S3ObjectStorage } from './infrastructure/s3-object-storage';

@Module({
  providers: [
    {
      provide: OBJECT_STORAGE,
      inject: [s3Config.KEY],
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
            // Recent SDK versions add CRC32 checksums to every request by default, and
            // presigned part URLs then expect the browser to send a matching checksum
            // header. Checksums only "when required" keep presigned uploads plain and
            // compatible with non-AWS S3 implementations such as SeaweedFS.
            requestChecksumCalculation: 'WHEN_REQUIRED',
            responseChecksumValidation: 'WHEN_REQUIRED',
          }),
          config.bucket,
        ),
    },
  ],
  exports: [OBJECT_STORAGE],
})
export class StorageModule {}
