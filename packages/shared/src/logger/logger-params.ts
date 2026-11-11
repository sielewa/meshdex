import type { Params } from 'nestjs-pino';
import { stdTimeFunctions } from 'pino';

export interface LoggerOptions {
  /** Added to every line as `service`, so Loki can filter by service. */
  serviceName: string;
  level: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  /** Human-readable output for local development; JSON everywhere else. */
  pretty: boolean;
}

/**
 * Paths masked in every log line (ADR 006). pino's `*` matches one level, so
 * `*.password` covers `{ user: { password } }` but not deeper nesting —
 * the rule "never log secrets" still applies; this is the safety net.
 */
export const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.secret',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.secretAccessKey',
  '*.presignedUrl',
];

/** Builds `LoggerModule.forRoot(...)` params shared by all NestJS services. */
export function buildLoggerParams(options: LoggerOptions): Params {
  return {
    pinoHttp: {
      level: options.level,
      base: { service: options.serviceName },
      timestamp: stdTimeFunctions.isoTime,
      redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
      ...(options.pretty
        ? {
            // Resolved here because pino loads transports by path in a worker thread,
            // and with pnpm's strict node_modules it couldn't find pino-pretty itself.
            transport: { target: require.resolve('pino-pretty'), options: { singleLine: true } },
          }
        : {
            // Text level labels ("info") instead of numbers (30) are easier to query in Loki.
            formatters: { level: (label: string) => ({ level: label }) },
          }),
    },
  };
}
