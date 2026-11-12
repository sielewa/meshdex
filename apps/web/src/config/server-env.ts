import 'server-only';
import { serverEnvSchema, type ServerEnv } from './server-env.schema';

let validated: ServerEnv | undefined;

/**
 * The validated server environment. Read at runtime (not inlined at build time like
 * `NEXT_PUBLIC_*`), so the same build runs in every environment. `instrumentation.ts`
 * calls it on startup, so a misconfigured pod fails before serving traffic.
 */
export function getServerEnv(): ServerEnv {
  if (!validated) {
    const result = serverEnvSchema.safeParse(process.env);

    if (!result.success) {
      // Names and rules only, never values (they may be secrets one day).
      const problems = result.error.issues.map(
        (issue) => `${issue.path.join('.')}: ${issue.message}`,
      );
      throw new Error(`Invalid web environment:\n  ${problems.join('\n  ')}`);
    }

    validated = result.data;
  }

  return validated;
}
