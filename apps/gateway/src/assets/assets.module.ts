import { Module } from '@nestjs/common';
import { AssetServiceClientModule } from '../clients/asset-service/asset-service-client.module';
import { AssetLoaderFactory } from './asset-loader.factory';
import { AssetVersionResolver } from './asset-version.resolver';
import { AssetsResolver } from './assets.resolver';
import { OriginalDownloadUrlLoaderFactory } from './original-download-url-loader.factory';

/** Asset queries; exports the DataLoader factories for the per-request GraphQL context. */
@Module({
  imports: [
    AssetServiceClientModule,
  ],
  providers: [
    AssetsResolver,
    AssetVersionResolver,
    AssetLoaderFactory,
    OriginalDownloadUrlLoaderFactory,
  ],
  exports: [
    AssetLoaderFactory,
    OriginalDownloadUrlLoaderFactory,
  ],
})
export class AssetsModule {}
