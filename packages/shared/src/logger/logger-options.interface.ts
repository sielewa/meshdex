export interface LoggerOptions {
  /** Logged as `service` on every line. */
  serviceName: string;
  level: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  pretty: boolean;
}
