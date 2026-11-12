import { Injectable, type BeforeApplicationShutdown } from '@nestjs/common';

/**
 * Liveness ("process is up") and readiness ("send me traffic") are separate on purpose:
 * during shutdown the pod stays alive but stops being ready, so Kubernetes removes it
 * from load balancing before in-flight requests are drained.
 *
 * Readiness deliberately ignores asset-service: if it did, an asset-service outage would
 * mark every gateway pod unready, and clients would get connection errors from the
 * ingress instead of a GraphQL SERVICE_UNAVAILABLE error they can handle (and queries
 * that don't need asset-service would fail too).
 */
@Injectable()
export class HealthService implements BeforeApplicationShutdown {
  private shuttingDown = false;

  isReady(): boolean {
    return !this.shuttingDown;
  }

  beforeApplicationShutdown(): void {
    this.shuttingDown = true;
  }
}
