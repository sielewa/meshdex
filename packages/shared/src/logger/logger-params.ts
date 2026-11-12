import type { Params } from 'nestjs-pino';
import { stdTimeFunctions } from 'pino';
import type { LoggerOptions } from './logger-options.interface';
import { REDACTED_PATHS } from './logger.constants';

/** Builds `LoggerModule.forRoot(...)` params shared by all NestJS services. */
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
            // Resolved here because pino loads transports by path in a worker thread,
            // and with pnpm's strict node_modules it couldn't find pino-pretty itself.
            transport: {
              target: require.resolve('pino-pretty'),
              options: { singleLine: true },
            },
          }
        : {
            // Text level labels ("info") instead of numbers (30) are easier to query in Loki.
            formatters: { level: (label: string) => ({ level: label }) },
          }),
    },
  };
}
