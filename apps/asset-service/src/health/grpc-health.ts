import { HealthImplementation } from 'grpc-health-check';
import { READINESS_SERVICE } from './health.constants';

/** The standard protocol Kubernetes probes speak. Registered by `main.ts`, outside DI. */
export const grpcHealth = new HealthImplementation({
  '': 'NOT_SERVING',
  [READINESS_SERVICE]: 'NOT_SERVING',
});
