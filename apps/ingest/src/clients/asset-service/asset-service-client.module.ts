import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { ASSET_SERVICE, ASSET_SERVICE_GRPC_CLIENT } from './asset-service.tokens';
import {
  AssetServiceClientOptionsFactory,
} from './infrastructure/asset-service-client-options.factory';
import { GrpcAssetServiceAdapter } from './infrastructure/grpc-asset-service.adapter';

/** The connection opens on the first call, so `fetch` never connects. */
@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: ASSET_SERVICE_GRPC_CLIENT,
        useClass: AssetServiceClientOptionsFactory,
      },
    ]),
  ],
  providers: [
    {
      provide: ASSET_SERVICE,
      useClass: GrpcAssetServiceAdapter,
    },
  ],
  exports: [
    ASSET_SERVICE,
  ],
})
export class AssetServiceClientModule {}
