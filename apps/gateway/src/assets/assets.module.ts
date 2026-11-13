import { Module } from '@nestjs/common';
import { AssetServiceClientModule } from '../clients/asset-service/asset-service-client.module';
import { AssetLoaderFactory } from './asset-loader.factory';
import { AssetVersionResolver } from './asset-version.resolver';
import { AssetsResolver } from './assets.resolver';
import { OriginalDownloadUrlLoaderFactory } from './original-download-url-loader.factory';
import { StoredFileResolver } from './stored-file.resolver';

/** Asset queries; exports the DataLoader factories for the per-request GraphQL context. */
@Module({
  imports: [
    AssetServiceClientModule,
  ],
  providers: [
    AssetsResolver,
    AssetVersionResolver,
    StoredFileResolver,
    AssetLoaderFactory,
    OriginalDownloadUrlLoaderFactory,
  ],
  exports: [
    AssetLoaderFactory,
    OriginalDownloadUrlLoaderFactory,
  ],
})
export class AssetsModule {}
