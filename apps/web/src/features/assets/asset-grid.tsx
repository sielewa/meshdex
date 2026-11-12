'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useGatewayEndpoint } from '@/graphql/use-gateway-endpoint';
import { AssetCard } from './asset-card';
import { assetsInfiniteQueryOptions } from './assets.queries';

/**
 * The asset list. The first page normally arrives hydrated from the server prefetch, so
 * the grid renders immediately; later pages are fetched from the browser on demand.
 */
export function AssetGrid(): ReactNode {
  const endpoint = useGatewayEndpoint();
  const { data, error, status, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery(assetsInfiniteQueryOptions(endpoint));

  if (status === 'pending') {
    return <p className="text-neutral-400">Loading assets…</p>;
  }

  if (status === 'error') {
    return (
      <div role="alert" className="space-y-3">
        <p className="text-red-300">Could not load assets: {error.message}</p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="rounded bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700"
        >
          Try again
        </button>
      </div>
    );
  }

  const assets = data.pages.flatMap((page) => page.assets.nodes);

  if (assets.length === 0) {
    return <p className="text-neutral-400">No assets yet.</p>;
  }

  return (
    <div className="space-y-6">
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {assets.map((asset) => (
          <li key={asset.id}>
            <AssetCard asset={asset} />
          </li>
        ))}
      </ul>
      {hasNextPage && (
        <button
          type="button"
          onClick={() => void fetchNextPage()}
          disabled={isFetchingNextPage}
          className="rounded bg-neutral-800 px-4 py-2 text-sm hover:bg-neutral-700 disabled:opacity-50"
        >
          {isFetchingNextPage ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}
