import type { Params } from 'nestjs-pino';
import { stdTimeFunctions } from 'pino';
import type { LoggerOptions } from './logger-options.interface';
import { REDACTED_PATHS } from './logger.constants';

export function buildLoggerParams(options: LoggerOptions): Params {
  return {
    pinoHttp: {
      level: options.level,
      base: { service: options.serviceName },
      timestamp: stdTimeFunctions.isoTime,
      redact: {
        paths: REDACTED_PATHS,
        censor: '[redacted]',
      },
      ...(options.pretty
        ? {
            // pino loads transports in a worker thread, which can't find pino-pretty under pnpm.
            transport: {
              target: require.resolve('pino-pretty'),
              options: { singleLine: true },
            },
          }
        : {
            formatters: { level: (label: string) => ({ level: label }) },
          }),
    },
  };
}
