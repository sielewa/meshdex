import { registerAs } from '@nestjs/config';
import { validateConfig } from '@meshdex/shared';
import { GatewayEnv } from './gateway.env';

let validatedEnv: GatewayEnv | undefined;

/** Validated once and cached; `main.ts` needs the port and CORS origins before Nest starts. */
function gatewayEnv(): GatewayEnv {
  validatedEnv ??= validateConfig(GatewayEnv, process.env);

  return validatedEnv;
}

export const httpConfig = registerAs('http', () => ({
  port: gatewayEnv().HTTP_PORT,
  corsOrigins: gatewayEnv().CORS_ORIGINS,
}));

export const graphqlConfig = registerAs('graphql', () => ({
  introspection: gatewayEnv().GRAPHQL_INTROSPECTION,
}));

export const assetServiceConfig = registerAs('assetService', () => ({
  url: gatewayEnv().ASSET_SERVICE_URL,
  readTimeoutMs: gatewayEnv().ASSET_SERVICE_READ_TIMEOUT_MS,
  writeTimeoutMs: gatewayEnv().ASSET_SERVICE_WRITE_TIMEOUT_MS,
}));

export const mlServiceConfig = registerAs('mlService', () => ({
  url: gatewayEnv().ML_SERVICE_URL,
  searchTimeoutMs: gatewayEnv().ML_SERVICE_SEARCH_TIMEOUT_MS,
}));

export const mediaConfig = registerAs('media', () => ({
  baseUrl: gatewayEnv().MEDIA_BASE_URL,
}));

export const loggerConfig = registerAs('logger', () => ({
  level: gatewayEnv().LOG_LEVEL,
  pretty: gatewayEnv().LOG_PRETTY,
}));

export const allConfigNamespaces = [
  httpConfig,
  graphqlConfig,
  assetServiceConfig,
  mlServiceConfig,
  mediaConfig,
  loggerConfig,
];
