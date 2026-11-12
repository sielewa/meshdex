import { Module } from '@nestjs/common';
import { AssetServiceClientModule } from '../clients/asset-service/asset-service-client.module';
import { ObjectStorageClientModule } from '../clients/object-storage/object-storage-client.module';
import { TasksModule } from '../tasks/tasks.module';
import { UploadService } from './upload.service';

/**
 * GLB bytes → an asset in asset-service, through the same upload flow as the browser:
 * `InitiateUpload`, parts to presigned URLs, `CompleteUpload`. Knows nothing of glTF or the
 * cache.
 */
@Module({
  imports: [
    AssetServiceClientModule,
    ObjectStorageClientModule,
    TasksModule,
  ],
  providers: [
    UploadService,
  ],
  exports: [
    UploadService,
  ],
})
export class UploadModule {}
