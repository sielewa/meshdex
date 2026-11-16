import { z } from 'zod';

const httpUrl = z.url({ protocol: /^https?$/ });

/** Apart from `server-env.ts` so it can be tested without the `server-only` guard (ADR 007). */
export const serverEnvSchema = z.object({
  GATEWAY_INTERNAL_URL: httpUrl,
  /** Passed to client components at runtime (ADR 012). */
  PUBLIC_GATEWAY_URL: httpUrl,
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
