import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validateSync, type ValidationError } from 'class-validator';

/** Thrown at startup when the environment doesn't match the service's config class. */
export class ConfigValidationException extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid configuration:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
    this.name = 'ConfigValidationException';
  }
}

/**
 * Validates raw environment variables against a class-validator schema and returns
 * a typed instance (ADR 007). Meant for `ConfigModule.forRoot({ validate })`, so a
 * misconfigured service fails at boot with **every** problem listed at once.
 *
 * Messages name the variable and the rule, never the value — values may be secrets.
 * Conversion from env strings is explicit in the schema (`@Type(() => Number)`), not implicit.
 */
export function validateConfig<T extends object>(
  schema: ClassConstructor<T>,
  rawEnv: Record<string, unknown>,
): T {
  const config = plainToInstance(schema, rawEnv);
  const errors = validateSync(config, { forbidUnknownValues: true });

  if (errors.length > 0) {
    throw new ConfigValidationException(errors.flatMap(describeError));
  }

  return config;
}

function describeError(error: ValidationError): string[] {
  const own = Object.values(error.constraints ?? {});
  const nested = (error.children ?? []).flatMap(describeError);

  return [...own, ...nested];
}
