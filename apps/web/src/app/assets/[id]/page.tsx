import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { getServerEnv } from '@/config/server-env';
import { AssetView } from '@/features/assets/components/asset-view';
import { assetQueryOptions } from '@/features/assets/api/assets.queries';
import type { AssetPageQuery } from '@/graphql/gql/graphql';
import { getServerQueryClient } from '@/lib/get-server-query-client';

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * Static on purpose: Next.js runs `generateMetadata` for every prefetch of this route (each
 * card in the grid), so fetching the asset there turned one grid view into 13 gateway calls.
 * Per-asset titles come with the SEO work in Stage 6.
 */
export const metadata: Metadata = { title: 'Asset · Meshdex' };

/** `undefined` when the gateway failed — the client view then fetches and reports the error itself. */
async function prefetchAsset(id: string): Promise<AssetPageQuery | undefined> {
  return getServerQueryClient()
    .query(assetQueryOptions(getServerEnv().GATEWAY_INTERNAL_URL, id))
    .catch(() => undefined);
}

/**
 * The id is a UUID here (`layout.tsx`). An asset that doesn't exist renders the not-found
 * page; the response is already streaming behind `loading.tsx`, so Next.js sends it with
 * status 200 and `noindex` (a soft 404).
 */
export default async function AssetPage({ params }: Props): Promise<ReactNode> {
  const { id } = await params;
  const data = await prefetchAsset(id);

  if (data && !data.asset) {
    notFound();
  }

  return (
    <HydrationBoundary state={dehydrate(getServerQueryClient())}>
      <AssetView id={id} />
    </HydrationBoundary>
  );
}
