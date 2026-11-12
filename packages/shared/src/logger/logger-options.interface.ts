export interface LoggerOptions {
  /** Added to every line as `service`, so Loki can filter by service. */
  serviceName: string;
  level: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  /** Human-readable output for local development; JSON everywhere else. */
  pretty: boolean;
}
