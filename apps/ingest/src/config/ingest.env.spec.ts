import 'reflect-metadata';
import { ConfigValidationException, validateConfig } from '@meshdex/shared';
import { IngestEnv } from './ingest.env';

const validEnv = {
  POLYHAVEN_API_URL: 'https://api.polyhaven.com',
  INGEST_CACHE_DIR: '.cache/polyhaven',
  LOG_LEVEL: 'info',
  LOG_PRETTY: 'false',
};

describe('IngestEnv', () => {
  it('accepts the documented example and converts types', () => {
    const env = validateConfig(IngestEnv, validEnv);

    expect(env.POLYHAVEN_API_URL).toBe('https://api.polyhaven.com');
    expect(env.LOG_PRETTY).toBe(false);
  });

  it('rejects an API URL without a protocol', () => {
    expect(() =>
      validateConfig(IngestEnv, {
        ...validEnv,
        POLYHAVEN_API_URL: 'api.polyhaven.com',
      }),
    ).toThrow(ConfigValidationException);
  });

  it('rejects an empty cache directory', () => {
    expect(() =>
      validateConfig(IngestEnv, {
        ...validEnv,
        INGEST_CACHE_DIR: '',
      }),
    ).toThrow(ConfigValidationException);
  });
});
