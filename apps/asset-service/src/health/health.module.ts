import { Module } from '@nestjs/common';
import { GRPC_HEALTH, grpcHealth } from './grpc-health';
import { HealthService } from './health.service';

@Module({
  providers: [{ provide: GRPC_HEALTH, useValue: grpcHealth }, HealthService],
})
export class HealthModule {}
