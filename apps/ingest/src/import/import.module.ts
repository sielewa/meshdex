import { Module } from '@nestjs/common';
import { CacheModule } from '../cache/cache.module';
import { AssetServiceClientModule } from '../clients/asset-service/asset-service-client.module';
import { ObjectStorageClientModule } from '../clients/object-storage/object-storage-client.module';
import { TasksModule } from '../tasks/tasks.module';
import { ImportService } from './import.service';
import { ImportStateService } from './import-state.service';
import { ModelPackerService } from './model-packer.service';
import { ModelUploaderService } from './model-uploader.service';

/** `ingest import`: local model cache → GLB → assets in asset-service. */
@Module({
  imports: [
    CacheModule,
    TasksModule,
    AssetServiceClientModule,
    ObjectStorageClientModule,
  ],
  providers: [
    ImportService,
    ImportStateService,
    ModelPackerService,
    ModelUploaderService,
  ],
  exports: [
    ImportService,
  ],
})
export class ImportModule {}
