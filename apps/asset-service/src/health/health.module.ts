import { Module } from '@nestjs/common';
import { grpcHealth } from './grpc-health';
import { GRPC_HEALTH } from './health.tokens';
import { HealthService } from './health.service';

@Module({
  providers: [
    {
      provide: GRPC_HEALTH,
      useValue: grpcHealth,
    },
    HealthService,
  ],
})
export class HealthModule {}
