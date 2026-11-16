import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { getServerEnv } from '@/config/server-env';
import { AssetGrid } from '@/features/assets/components/asset-grid';
import { assetsInfiniteQueryOptions } from '@/features/assets/api/assets.queries';
import { getServerQueryClient } from '@/lib/get-server-query-client';

/** A failed prefetch doesn't fail the page: the grid fetches and reports errors in the browser. */
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
