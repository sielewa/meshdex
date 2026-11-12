import { HealthImplementation } from 'grpc-health-check';
import { READINESS_SERVICE } from './health.constants';

/**
 * Standard gRPC health protocol (`grpc.health.v1.Health`), which Kubernetes gRPC
 * probes speak natively. One instance per process: `main.ts` registers it on the
 * gRPC server (outside DI) and `HealthService` drives the statuses through the
 * `GRPC_HEALTH` token. Both start as NOT_SERVING until the app has bootstrapped.
 */
export const grpcHealth = new HealthImplementation({
  '': 'NOT_SERVING',
  [READINESS_SERVICE]: 'NOT_SERVING',
});
