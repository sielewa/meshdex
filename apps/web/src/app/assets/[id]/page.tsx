import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { z } from 'zod';
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

/** Malformed ids and assets that don't exist are a real 404, not an empty page. */
export default async function AssetPage({ params }: Props): Promise<ReactNode> {
  const { id } = await params;

  if (!z.uuid().safeParse(id).success) {
    notFound();
  }

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
