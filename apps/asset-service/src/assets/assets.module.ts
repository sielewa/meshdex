import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { StorageModule } from '../storage/storage.module';
import { AssetVersionsRepository } from './infrastructure/asset-versions.repository';
import { AssetsRepository } from './infrastructure/assets.repository';
import { OutboxRepository } from './infrastructure/outbox.repository';
import { TagsRepository } from './infrastructure/tags.repository';
import { AssetProcessingController } from './asset-processing.controller';
import { AssetProcessingService } from './asset-processing.service';
import { AssetUploadController } from './asset-upload.controller';
import { AssetUploadService } from './asset-upload.service';

/** Owner of the asset version lifecycle writes (ADR 005): upload and processing. */
@Module({
  imports: [
    StorageModule,
    CatalogModule,
  ],
  controllers: [
    AssetUploadController,
    AssetProcessingController,
  ],
  providers: [
    AssetUploadService,
    AssetProcessingService,
    AssetsRepository,
    AssetVersionsRepository,
    TagsRepository,
    OutboxRepository,
  ],
})
export class AssetsModule {}
