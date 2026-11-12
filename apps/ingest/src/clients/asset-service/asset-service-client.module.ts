import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { ASSET_SERVICE, ASSET_SERVICE_GRPC_CLIENT } from './asset-service.tokens';
import {
  AssetServiceClientOptionsFactory,
} from './infrastructure/asset-service-client-options.factory';
import { GrpcAssetServiceAdapter } from './infrastructure/grpc-asset-service.adapter';

/**
 * Client of the asset-service microservice: only the gRPC connection and the translation of
 * its contract. Exports only the `ASSET_SERVICE` port. The connection opens on the first
 * call, so commands that never upload (`fetch`) never connect.
 */
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
