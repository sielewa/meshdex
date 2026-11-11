import 'reflect-metadata';
import { ConfigValidationException, validateConfig } from '@meshdex/shared';
import { AssetServiceEnv } from './asset-service.env';

const validEnv = {
  GRPC_URL: '0.0.0.0:50051',
  DATABASE_URL: 'postgres://asset:secret@localhost:5432/asset',
  DATABASE_POOL_MAX: '10',
  S3_ENDPOINT: 'http://localhost:8333',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'meshdex-assets',
  S3_ACCESS_KEY_ID: 'key',
  S3_SECRET_ACCESS_KEY: 'secret',
  S3_FORCE_PATH_STYLE: 'true',
  UPLOAD_MAX_SIZE_BYTES: '536870912',
  UPLOAD_PART_SIZE_BYTES: '16777216',
  UPLOAD_URL_TTL_SECONDS: '3600',
  LOG_LEVEL: 'info',
  LOG_PRETTY: 'false',
};

describe('AssetServiceEnv', () => {
  it('accepts the documented example and converts types', () => {
    const env = validateConfig(AssetServiceEnv, validEnv);

    expect(env.DATABASE_POOL_MAX).toBe(10);
    expect(env.S3_FORCE_PATH_STYLE).toBe(true);
    expect(env.LOG_PRETTY).toBe(false);
  });

  it('rejects a part size below the 5 MiB S3 minimum', () => {
    expect(() =>
      validateConfig(AssetServiceEnv, { ...validEnv, UPLOAD_PART_SIZE_BYTES: '1048576' }),
    ).toThrow(ConfigValidationException);
  });

  it('rejects booleans that are not literally "true" or "false"', () => {
    expect(() => validateConfig(AssetServiceEnv, { ...validEnv, LOG_PRETTY: 'yes' })).toThrow(
      ConfigValidationException,
    );
  });
});
