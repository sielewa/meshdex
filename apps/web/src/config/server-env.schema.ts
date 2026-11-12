import { z } from 'zod';

const httpUrl = z.url({ protocol: /^https?$/ });

/**
 * Environment of the web server, validated at startup (ADR 007: zod in the web app).
 * Kept apart from `server-env.ts` so it can be unit-tested without the `server-only` guard.
 */
export const serverEnvSchema = z.object({
  /** GraphQL endpoint for server-side rendering (in the cluster: the gateway's Service). */
  GATEWAY_INTERNAL_URL: httpUrl,
  /** GraphQL endpoint for browsers; passed to client components at runtime (ADR 012). */
  PUBLIC_GATEWAY_URL: httpUrl,
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
