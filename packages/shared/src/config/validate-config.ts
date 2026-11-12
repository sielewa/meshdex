import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validateSync, type ValidationError } from 'class-validator';
import { ConfigValidationException } from './config-validation.exception';

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
  const describe = (error: ValidationError): string[] => [
    ...Object.values(error.constraints ?? {}),
    ...(error.children ?? []).flatMap(describe),
  ];
  const config = plainToInstance(schema, rawEnv);
  const errors = validateSync(config, { forbidUnknownValues: true });

  if (errors.length > 0) {
    throw new ConfigValidationException(errors.flatMap(describe));
  }

  return config;
}
