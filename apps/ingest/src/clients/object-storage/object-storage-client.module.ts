import { Module } from '@nestjs/common';
import { HttpPresignedUploadAdapter } from './infrastructure/http-presigned-upload.adapter';
import { PRESIGNED_UPLOAD } from './object-storage.tokens';

/** Uploads to object storage over presigned URLs; exports only the `PRESIGNED_UPLOAD` port. */
@Module({
  providers: [
    {
      provide: PRESIGNED_UPLOAD,
      useClass: HttpPresignedUploadAdapter,
    },
  ],
  exports: [
    PRESIGNED_UPLOAD,
  ],
})
export class ObjectStorageClientModule {}
