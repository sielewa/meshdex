import {
  Inject,
  Injectable,
  type BeforeApplicationShutdown,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { HealthImplementation } from 'grpc-health-check';
import { READINESS_SERVICE } from './health.constants';
import { GRPC_HEALTH } from './health.tokens';

/** Separate so that during shutdown the pod stays alive but leaves load balancing. */
@Injectable()
export class HealthService implements OnApplicationBootstrap, BeforeApplicationShutdown {
  constructor(@Inject(GRPC_HEALTH) private readonly health: HealthImplementation) {}

  onApplicationBootstrap(): void {
    this.health.setStatus('', 'SERVING');
    this.health.setStatus(READINESS_SERVICE, 'SERVING');
  }

  beforeApplicationShutdown(): void {
    this.health.setStatus(READINESS_SERVICE, 'NOT_SERVING');
  }
}
