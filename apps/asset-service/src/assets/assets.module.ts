import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { AssetViewsRepository } from './infrastructure/asset-views.repository';
import { AssetVersionsRepository } from './infrastructure/asset-versions.repository';
import { AssetsRepository } from './infrastructure/assets.repository';
import { OutboxRepository } from './infrastructure/outbox.repository';
import { TagsRepository } from './infrastructure/tags.repository';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';

/** Owner of the asset version lifecycle writes (ADR 005): upload now, processing next. */
@Module({
  imports: [StorageModule],
  controllers: [UploadController],
  providers: [
    UploadService,
    AssetsRepository,
    AssetVersionsRepository,
    TagsRepository,
    OutboxRepository,
    AssetViewsRepository,
  ],
})
export class AssetsModule {}
