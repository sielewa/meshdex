import { Module } from '@nestjs/common';
import { AssetServiceClientModule } from '../clients/asset-service/asset-service-client.module';
import { ObjectStorageClientModule } from '../clients/object-storage/object-storage-client.module';
import { TasksModule } from '../tasks/tasks.module';
import { UploadService } from './upload.service';

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
