import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GatewayEndpointContext } from '@/graphql/gateway-endpoint-context';
import { AssetGrid } from './asset-grid';

const endpoint = 'http://gateway.test/graphql';

const asset = (id: string, title: string) => ({
  id,
  title,
  tags: ['chair'],
  status: 'UPLOADED',
  createdAt: '2026-11-12T09:00:00.123Z',
  currentVersion: {
    number: 1,
    original: { sizeBytes: 20_971_520 },
  },
});

const page = (nodes: unknown[], endCursor: string | null) => ({
  data: {
    assets: {
      nodes,
      pageInfo: {
        endCursor,
        hasNextPage: endCursor !== null,
      },
    },
  },
});

const renderGrid = (): void => {
  // No retries: a failing request should show the error state immediately.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <GatewayEndpointContext value={endpoint}>
      <QueryClientProvider client={queryClient}>
        <AssetGrid />
      </QueryClientProvider>
    </GatewayEndpointContext>,
  );
};

const stubResponses = (
  ...bodies: unknown[]
): ReturnType<typeof vi.fn<(url: string, init: RequestInit) => Promise<Response>>> => {
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

describe('AssetGrid', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the first page and loads the next one from the end cursor', async () => {
    const fetchMock = stubResponses(
      page([asset('1', 'Chair')], 'cursor-1'),
      page([asset('2', 'Table')], null),
    );
    renderGrid();

    expect(await screen.findByRole('heading', { name: 'Chair' })).toBeDefined();
    expect(screen.getByText('Uploaded')).toBeDefined();
    expect(screen.getByText(/21\.0 MB/)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));

    expect(await screen.findByRole('heading', { name: 'Table' })).toBeDefined();
    expect(variablesOf(fetchMock.mock.calls[0])).toEqual({ first: 24, after: null });
    expect(variablesOf(fetchMock.mock.calls[1])).toEqual({ first: 24, after: 'cursor-1' });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
    });
  });

  it('shows the gateway error and lets the user retry', async () => {
    stubResponses(
      {
        data: null,
        errors: [
          { message: 'asset-service is unavailable', extensions: { code: 'SERVICE_UNAVAILABLE' } },
        ],
      },
      page([asset('1', 'Chair')], null),
    );
    renderGrid();

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining('asset-service is unavailable') as string,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('heading', { name: 'Chair' })).toBeDefined();
  });

  it('says so when there are no assets', async () => {
    stubResponses(page([], null));
    renderGrid();

    expect(await screen.findByText('No assets yet.')).toBeDefined();
  });
});
