import { Injectable, type BeforeApplicationShutdown } from '@nestjs/common';

/**
 * Separate so that during shutdown the pod stays alive but leaves load balancing. Readiness
 * ignores asset-service: an outage would make every pod unready, and clients would get
 * connection errors instead of a SERVICE_UNAVAILABLE they can handle.
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
