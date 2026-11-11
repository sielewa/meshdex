import { HealthImplementation } from 'grpc-health-check';

/** Service name Kubernetes queries for readiness; liveness uses the empty name (whole server). */
export const READINESS_SERVICE = 'meshdex.asset.v1.AssetService';

export const GRPC_HEALTH = Symbol('GRPC_HEALTH');

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
