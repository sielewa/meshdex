import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { getServerEnv } from '@/config/server-env';
import { AssetGrid } from '@/features/assets/asset-grid';
import { assetsInfiniteQueryOptions } from '@/features/assets/assets.queries';
import { getServerQueryClient } from '@/lib/get-server-query-client';

/**
 * Prefetches the first page on the server (internal gateway endpoint) and hands it to the
 * client grid through the dehydrated cache. A failed prefetch doesn't fail the page: the
 * query is simply missing, and the grid fetches (and reports errors) in the browser.
 */
export default async function HomePage(): Promise<ReactNode> {
  const queryClient = getServerQueryClient();

  await queryClient
    .infiniteQuery(assetsInfiniteQueryOptions(getServerEnv().GATEWAY_INTERNAL_URL))
    .catch(() => undefined);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Assets</h1>
      <HydrationBoundary state={dehydrate(queryClient)}>
        <AssetGrid />
      </HydrationBoundary>
    </div>
  );
}
