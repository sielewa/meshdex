'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { useGatewayEndpoint } from '@/graphql/use-gateway-endpoint';
import { AssetCard } from '@/features/assets/components/asset-card';
import { searchAssetsQueryOptions } from '@/features/assets/api/assets.queries';
import { MAX_SEARCH_RESULTS, SEARCH_RESULTS_STEP } from '@/features/assets/assets.constants';

/**
 * Results of one text search, best match first. The first step normally arrives hydrated from
 * the server prefetch. "Show more" asks again with a larger `first` (ranked results have no
 * cursor, ADR 020); the shown results stay on screen while the larger list loads. The page
 * keys this component by the query, so a new search starts again from the first step.
 */
export function AssetSearchResults({ query }: { query: string }): ReactNode {
  const endpoint = useGatewayEndpoint();
  const [first, setFirst] = useState(SEARCH_RESULTS_STEP);
  const { data, error, status, refetch, isPlaceholderData } = useQuery({
    ...searchAssetsQueryOptions(endpoint, query, first),
    placeholderData: keepPreviousData,
  });

  if (status === 'pending') {
    return <p className="text-neutral-400">Searching…</p>;
  }

  if (status === 'error') {
    return (
      <div role="alert" className="space-y-3">
        <p className="text-red-300">Search failed: {error.message}</p>
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

  const { hits } = data.searchAssets;

  if (hits.length === 0) {
    return <p className="text-neutral-400">No models match “{query}”.</p>;
  }

  // A full step means the index may hold more; fewer means this was everything.
  const mayHaveMore = hits.length === first && first < MAX_SEARCH_RESULTS;

  return (
    <div className="space-y-6">
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {hits.map((hit) => (
          <li key={hit.asset.id}>
            <AssetCard asset={hit.asset} />
          </li>
        ))}
      </ul>
      {mayHaveMore && (
        <button
          type="button"
          onClick={() => {
            setFirst(Math.min(first + SEARCH_RESULTS_STEP, MAX_SEARCH_RESULTS));
          }}
          disabled={isPlaceholderData}
          className="rounded bg-neutral-800 px-4 py-2 text-sm hover:bg-neutral-700 disabled:opacity-50"
        >
          {isPlaceholderData ? 'Loading…' : 'Show more'}
        </button>
      )}
    </div>
  );
}
