/** A safety net (ADR 006): pino's `*` matches one level only, so deeper secrets still leak. */
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
