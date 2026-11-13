import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getServerEnv } from '@/config/server-env';
import { AssetSearchForm } from '@/features/assets/components/asset-search-form';
import { AssetSearchResults } from '@/features/assets/components/asset-search-results';
import { searchAssetsQueryOptions } from '@/features/assets/api/assets.queries';
import { SEARCH_RESULTS_STEP } from '@/features/assets/assets.constants';
import { getServerQueryClient } from '@/lib/get-server-query-client';

interface Props {
  searchParams: Promise<{ q?: string | string[] }>;
}

/** Static: `generateMetadata` runs on every prefetch of the route (docs/conventions.md). */
export const metadata: Metadata = { title: 'Search · Meshdex' };

/**
 * Text search (CLIP over the models' preview images). Prefetches the first step of results
 * on the server; a failed prefetch leaves the client to fetch and report the error.
 */
export default async function SearchPage({ searchParams }: Props): Promise<ReactNode> {
  const { q } = await searchParams;
  // `?q=a&q=b` takes the first; whitespace-only counts as no query.
  const query = (Array.isArray(q) ? (q[0] ?? '') : (q ?? '')).trim();

  if (query === '') {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Search</h1>
        <AssetSearchForm autoFocus />
        <p className="text-neutral-400">
          Describe what you are looking for, e.g. “wooden chair” or “a lamp to read by”.
        </p>
      </div>
    );
  }

  const queryClient = getServerQueryClient();

  await queryClient
    .query(
      searchAssetsQueryOptions(getServerEnv().GATEWAY_INTERNAL_URL, query, SEARCH_RESULTS_STEP),
    )
    .catch(() => undefined);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Search</h1>
      <AssetSearchForm key={query} defaultQuery={query} />
      <HydrationBoundary state={dehydrate(queryClient)}>
        <AssetSearchResults key={query} query={query} />
      </HydrationBoundary>
    </div>
  );
}
