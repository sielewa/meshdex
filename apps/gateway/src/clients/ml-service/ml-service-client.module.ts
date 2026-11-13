import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { MlServiceClientOptionsFactory } from './infrastructure/ml-service-client-options.factory';
import { GrpcMlServiceAdapter } from './infrastructure/grpc-ml-service.adapter';
import { ML_SERVICE, ML_SERVICE_GRPC_CLIENT } from './ml-service.tokens';

/**
 * Client of the separate ml-service microservice: only the gRPC connection and the
 * translation of its contract. Exports only the `ML_SERVICE` port.
 */
@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: ML_SERVICE_GRPC_CLIENT,
        useClass: MlServiceClientOptionsFactory,
      },
    ]),
  ],
  providers: [
    {
      provide: ML_SERVICE,
      useClass: GrpcMlServiceAdapter,
    },
  ],
  exports: [
    ML_SERVICE,
  ],
})
export class MlServiceClientModule {}
