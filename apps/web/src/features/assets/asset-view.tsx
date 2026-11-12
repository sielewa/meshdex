'use client';

import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';
import { useGatewayEndpoint } from '@/graphql/use-gateway-endpoint';
import { AssetDetails } from './asset-details';
import { assetQueryOptions } from './assets.queries';

/**
 * three.js and the viewer are a separate chunk, fetched only when this page renders, and
 * never rendered on the server (WebGL exists only in the browser).
 */
const ModelViewer = dynamic(
  () => import('@/features/viewer/model-viewer').then((module) => module.ModelViewer),
  {
    ssr: false,
    loading: () => <p className="p-6 text-sm text-neutral-400">Loading viewer…</p>,
  },
);

/** The asset page body; data normally arrives hydrated from the page's server prefetch. */
export function AssetView({ id }: { id: string }): ReactNode {
  const endpoint = useGatewayEndpoint();
  const { data, error, status, refetch } = useQuery(assetQueryOptions(endpoint, id));

  if (status === 'pending') {
    return <p className="text-neutral-400">Loading asset…</p>;
  }

  if (status === 'error') {
    return (
      <div role="alert" className="space-y-3">
        <p className="text-red-300">Could not load the asset: {error.message}</p>
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

  if (!data.asset) {
    return <p className="text-neutral-400">This asset no longer exists.</p>;
  }

  const downloadUrl = data.asset.currentVersion.originalDownloadUrl;

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <div className="aspect-[4/3] overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900">
        {downloadUrl ? (
          // A retry fetches the asset again, which signs a fresh URL (e.g. after expiry).
          <ModelViewer url={downloadUrl.url} onRetry={() => void refetch()} />
        ) : (
          <p className="p-6 text-sm text-neutral-400">The file is still uploading.</p>
        )}
      </div>
      <AssetDetails asset={data.asset} />
    </div>
  );
}
