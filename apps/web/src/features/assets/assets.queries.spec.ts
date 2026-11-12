import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AssetPageQuery } from '@/graphql/gql/graphql';
import { DEFAULT_STALE_TIME_MS } from '@/lib/query-client.constants';
import { staleTimeUntilUrlExpiry } from './assets.queries';

const NOW = Date.UTC(2026, 10, 12, 9, 0, 0);

const withUrlExpiring = (expiresAt: string | null): AssetPageQuery =>
  ({
    asset: {
      currentVersion: {
        originalDownloadUrl:
          expiresAt === null ? null : { url: 'https://storage.test/x', expiresAt },
      },
    },
  }) as AssetPageQuery;

describe('staleTimeUntilUrlExpiry', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps data fresh until a minute before the signed URL expires', () => {
    vi.useFakeTimers({ now: NOW });

    expect(staleTimeUntilUrlExpiry(withUrlExpiring('2026-11-12T09:15:00.000Z'))).toBe(14 * 60_000);
  });

  it('marks data stale once the URL is about to expire', () => {
    vi.useFakeTimers({ now: NOW });

    expect(staleTimeUntilUrlExpiry(withUrlExpiring('2026-11-12T09:00:30.000Z'))).toBe(0);
  });

  it('falls back to the default without a URL (upload still running, or no data)', () => {
    expect(staleTimeUntilUrlExpiry(withUrlExpiring(null))).toBe(DEFAULT_STALE_TIME_MS);
    expect(staleTimeUntilUrlExpiry(undefined)).toBe(DEFAULT_STALE_TIME_MS);
  });
});
