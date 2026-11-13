import 'reflect-metadata';
import { ConfigValidationException, validateConfig } from '@meshdex/shared';
import { GatewayEnv } from './gateway.env';

const validEnv = {
  HTTP_PORT: '4000',
  CORS_ORIGINS: 'http://localhost:3000, https://meshdex.example',
  GRAPHQL_INTROSPECTION: 'true',
  ASSET_SERVICE_URL: 'localhost:50051',
  ASSET_SERVICE_READ_TIMEOUT_MS: '2000',
  ASSET_SERVICE_WRITE_TIMEOUT_MS: '15000',
  MEDIA_BASE_URL: 'http://localhost:8333/meshdex-assets',
  LOG_LEVEL: 'info',
  LOG_PRETTY: 'false',
};

describe('GatewayEnv', () => {
  it('accepts the documented example and converts types', () => {
    const env = validateConfig(GatewayEnv, validEnv);

    expect(env.HTTP_PORT).toBe(4000);
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:3000', 'https://meshdex.example']);
    expect(env.GRAPHQL_INTROSPECTION).toBe(true);
    expect(env.ASSET_SERVICE_READ_TIMEOUT_MS).toBe(2000);
  });

  it('rejects a CORS origin without a protocol', () => {
    expect(() =>
      validateConfig(GatewayEnv, {
        ...validEnv,
        CORS_ORIGINS: 'localhost:3000',
      }),
    ).toThrow(ConfigValidationException);
  });

  it('ends the media base URL with a slash, so a key can be appended', () => {
    expect(validateConfig(GatewayEnv, validEnv).MEDIA_BASE_URL).toBe(
      'http://localhost:8333/meshdex-assets/',
    );
  });

  it('rejects a media base URL without a protocol', () => {
    expect(() =>
      validateConfig(GatewayEnv, {
        ...validEnv,
        MEDIA_BASE_URL: 'cdn.meshdex.example',
      }),
    ).toThrow(ConfigValidationException);
  });

  it('rejects a missing deadline', () => {
    const { ASSET_SERVICE_READ_TIMEOUT_MS: _omitted, ...withoutReadTimeout } = validEnv;

    expect(() => validateConfig(GatewayEnv, withoutReadTimeout)).toThrow(ConfigValidationException);
  });
});
