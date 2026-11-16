import 'server-only';
import { serverEnvSchema, type ServerEnv } from '@/config/server-env.schema';

let validated: ServerEnv | undefined;

/** Read at runtime, unlike `NEXT_PUBLIC_*`, so one build runs in every environment. */
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
