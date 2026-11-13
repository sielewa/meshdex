import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GatewayEndpointContext } from '@/graphql/gateway-endpoint-context';
import { AssetSearchResults } from '@/features/assets/components/asset-search-results';

const endpoint = 'http://gateway.test/graphql';

const asset = (id: string, title: string) => ({
  id,
  title,
  tags: [],
  status: 'UPLOADED',
  createdAt: '2026-11-12T09:00:00.123Z',
  currentVersion: {
    number: 1,
    original: { sizeBytes: 1_000_000 },
    thumbnails: [],
    sourcePreview: null,
  },
});

/** `count` hits named "Model 1", "Model 2"…, best first. */
const results = (count: number) => ({
  data: {
    searchAssets: {
      hits: Array.from({ length: count }, (_, index) => ({
        score: 0.5 - index / 1000,
        asset: asset(String(index + 1), `Model ${String(index + 1)}`),
      })),
    },
  },
});

const stubResponses = (...bodies: unknown[]) => {
  const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>();

  for (const body of bodies) {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body)));
  }
  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
};

const variablesOf = (call: [string, RequestInit] | undefined): unknown => {
  const body = call?.[1].body;

  return typeof body === 'string'
    ? (JSON.parse(body) as { variables: unknown }).variables
    : undefined;
};

const renderResults = (query: string): void => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <GatewayEndpointContext value={endpoint}>
      <QueryClientProvider client={queryClient}>
        <AssetSearchResults query={query} />
      </QueryClientProvider>
    </GatewayEndpointContext>,
  );
};

describe('AssetSearchResults', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the hits in rank order', async () => {
    const fetchMock = stubResponses(results(3));
    renderResults('wooden chair');

    await screen.findByRole('heading', { name: 'Model 1' });

    expect(screen.getAllByRole('heading').map((heading) => heading.textContent)).toEqual([
      'Model 1',
      'Model 2',
      'Model 3',
    ]);
    expect(variablesOf(fetchMock.mock.calls[0])).toEqual({ query: 'wooden chair', first: 24 });
    // Fewer hits than asked for: that was everything.
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();
  });

  it('asks again with a larger first and keeps the results on screen meanwhile', async () => {
    const fetchMock = stubResponses(results(24), results(30));
    renderResults('lamp');

    await screen.findByRole('heading', { name: 'Model 24' });
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));

    // The first 24 stay while the larger list loads.
    expect(screen.getByRole('heading', { name: 'Model 1' })).toBeDefined();
    expect(await screen.findByRole('heading', { name: 'Model 30' })).toBeDefined();
    expect(variablesOf(fetchMock.mock.calls[1])).toEqual({ query: 'lamp', first: 48 });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();
    });
  });

  it('says so when nothing matches', async () => {
    stubResponses(results(0));
    renderResults('spaceship');

    expect(await screen.findByText('No models match “spaceship”.')).toBeDefined();
  });

  it('shows the gateway error and retries on request', async () => {
    stubResponses(
      {
        errors: [
          { message: 'ml-service is unavailable', extensions: { code: 'SERVICE_UNAVAILABLE' } },
        ],
      },
      results(1),
    );
    renderResults('chair');

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining('ml-service is unavailable'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('heading', { name: 'Model 1' })).toBeDefined();
  });
});
