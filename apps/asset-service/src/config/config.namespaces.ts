import { registerAs } from '@nestjs/config';
import { validateConfig } from '@meshdex/shared';
import { AssetServiceEnv } from './asset-service.env';

let validatedEnv: AssetServiceEnv | undefined;

/** Validated once and cached; `main.ts` needs the gRPC URL before Nest starts. */
function assetServiceEnv(): AssetServiceEnv {
  validatedEnv ??= validateConfig(AssetServiceEnv, process.env);

  return validatedEnv;
}

export const grpcConfig = registerAs('grpc', () => ({
  url: assetServiceEnv().GRPC_URL,
}));

export const databaseConfig = registerAs('database', () => ({
  url: assetServiceEnv().DATABASE_URL,
  poolMax: assetServiceEnv().DATABASE_POOL_MAX,
}));

export const s3Config = registerAs('s3', () => ({
  endpoint: assetServiceEnv().S3_ENDPOINT,
  region: assetServiceEnv().S3_REGION,
  bucket: assetServiceEnv().S3_BUCKET,
  accessKeyId: assetServiceEnv().S3_ACCESS_KEY_ID,
  secretAccessKey: assetServiceEnv().S3_SECRET_ACCESS_KEY,
  forcePathStyle: assetServiceEnv().S3_FORCE_PATH_STYLE,
}));

export const uploadConfig = registerAs('upload', () => ({
  maxSizeBytes: assetServiceEnv().UPLOAD_MAX_SIZE_BYTES,
  partSizeBytes: assetServiceEnv().UPLOAD_PART_SIZE_BYTES,
  urlTtlSeconds: assetServiceEnv().UPLOAD_URL_TTL_SECONDS,
}));

export const downloadConfig = registerAs('download', () => ({
  urlTtlSeconds: assetServiceEnv().DOWNLOAD_URL_TTL_SECONDS,
}));

export const loggerConfig = registerAs('logger', () => ({
  level: assetServiceEnv().LOG_LEVEL,
  pretty: assetServiceEnv().LOG_PRETTY,
}));

export const allConfigNamespaces = [
  grpcConfig,
  databaseConfig,
  s3Config,
  uploadConfig,
  downloadConfig,
  loggerConfig,
];
