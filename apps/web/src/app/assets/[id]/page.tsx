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

/** Static: `generateMetadata` runs on every prefetch, which made one grid view 13 gateway calls. */
export const metadata: Metadata = { title: 'Asset · Meshdex' };

/** `undefined` on failure: the client view then fetches and reports the error itself. */
async function prefetchAsset(id: string): Promise<AssetPageQuery | undefined> {
  return getServerQueryClient()
    .query(assetQueryOptions(getServerEnv().GATEWAY_INTERNAL_URL, id))
    .catch(() => undefined);
}

/** An unknown asset is a soft 404 (200 + `noindex`): the response is already streaming. */
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
