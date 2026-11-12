import { Module } from '@nestjs/common';
import { AssetServiceClientModule } from '../clients/asset-service/asset-service-client.module';
import { UploadsResolver } from './uploads.resolver';

@Module({
  imports: [
    AssetServiceClientModule,
  ],
  providers: [
    UploadsResolver,
  ],
})
export class UploadsModule {}
