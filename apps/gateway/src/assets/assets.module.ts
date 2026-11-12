import { Module } from '@nestjs/common';
import { AssetServiceClientModule } from '../clients/asset-service/asset-service-client.module';
import { AssetLoaderFactory } from './asset-loader.factory';
import { AssetsResolver } from './assets.resolver';

/** Asset queries; exports `AssetLoaderFactory` for the per-request GraphQL context. */
@Module({
  imports: [
    AssetServiceClientModule,
  ],
  providers: [
    AssetsResolver,
    AssetLoaderFactory,
  ],
  exports: [
    AssetLoaderFactory,
  ],
})
export class AssetsModule {}
