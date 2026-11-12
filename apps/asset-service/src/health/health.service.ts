import {
  Inject,
  Injectable,
  type BeforeApplicationShutdown,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { HealthImplementation } from 'grpc-health-check';
import { READINESS_SERVICE } from './health.constants';
import { GRPC_HEALTH } from './health.tokens';

/**
 * Liveness ("process is up") and readiness ("send me traffic") are separate on purpose:
 * during shutdown the pod stays alive but stops being ready, so Kubernetes removes it
 * from load balancing before in-flight calls are drained.
 */
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
