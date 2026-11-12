import { describe, expect, it } from 'vitest';
import { serverEnvSchema } from '@/config/server-env.schema';

const validEnv = {
  GATEWAY_INTERNAL_URL: 'http://gateway:4000/graphql',
  PUBLIC_GATEWAY_URL: 'https://api.meshdex.example/graphql',
};

describe('serverEnvSchema', () => {
  it('accepts the documented example', () => {
    expect(serverEnvSchema.parse(validEnv)).toEqual(validEnv);
  });

  it('rejects a missing or non-HTTP gateway URL', () => {
    expect(
      serverEnvSchema.safeParse({ PUBLIC_GATEWAY_URL: validEnv.PUBLIC_GATEWAY_URL }).success,
    ).toBe(false);
    expect(
      serverEnvSchema.safeParse({
        ...validEnv,
        GATEWAY_INTERNAL_URL: 'gateway:4000',
      }).success,
    ).toBe(false);
  });
});
