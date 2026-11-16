import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validateSync, type ValidationError } from 'class-validator';
import { ConfigValidationException } from './config-validation.exception';

/**
 * Lists every problem at once (ADR 007). Messages name the variable and the rule, never the
 * value: values may be secrets.
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
