import { Module } from '@nestjs/common';
import { AssetProtoMapper } from './asset-proto.mapper';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { AssetListRepository } from './infrastructure/asset-list.repository';
import { AssetViewsRepository } from './infrastructure/asset-views.repository';

@Module({
  controllers: [
    CatalogController,
  ],
  providers: [
    CatalogService,
    AssetProtoMapper,
    AssetViewsRepository,
    AssetListRepository,
  ],
  exports: [
    CatalogService,
    AssetProtoMapper,
  ],
})
export class CatalogModule {}
