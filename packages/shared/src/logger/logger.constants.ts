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
