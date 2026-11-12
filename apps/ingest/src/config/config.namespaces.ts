import { resolve } from 'node:path';
import { registerAs } from '@nestjs/config';
import { validateConfig } from '@meshdex/shared';
import { IngestEnv } from './ingest.env';

let validatedEnv: IngestEnv | undefined;

/**
 * Validates `process.env` on first use and caches the result, so all namespaces share one
 * validation pass. Throws `ConfigValidationException` listing every problem.
 */
function ingestEnv(): IngestEnv {
  validatedEnv ??= validateConfig(IngestEnv, process.env);

  return validatedEnv;
}

export const polyhavenConfig = registerAs('polyhaven', () => ({
  apiUrl: ingestEnv().POLYHAVEN_API_URL.replace(/\/+$/, ''),
}));

export const cacheConfig = registerAs('cache', () => ({
  // Resolved once, so every module agrees on the directory whatever its own cwd assumptions.
  dir: resolve(ingestEnv().INGEST_CACHE_DIR),
}));

export const assetServiceConfig = registerAs('assetService', () => ({
  url: ingestEnv().ASSET_SERVICE_URL,
  readTimeoutMs: ingestEnv().ASSET_SERVICE_READ_TIMEOUT_MS,
  writeTimeoutMs: ingestEnv().ASSET_SERVICE_WRITE_TIMEOUT_MS,
}));

export const loggerConfig = registerAs('logger', () => ({
  level: ingestEnv().LOG_LEVEL,
  pretty: ingestEnv().LOG_PRETTY,
}));

export const allConfigNamespaces = [polyhavenConfig, cacheConfig, assetServiceConfig, loggerConfig];
