'use client';

import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { useCallback, useState, type ReactNode } from 'react';
import { useGatewayEndpoint } from '@/graphql/use-gateway-endpoint';
import { AssetDetails } from '@/features/assets/components/asset-details';
import { assetQueryOptions } from '@/features/assets/api/assets.queries';
import { previewImageUrl } from '@/features/assets/lib/preview-image-url';
import { FADE_DURATION_MS } from '@/components/model-viewer/model-viewer.constants';

const ModelViewer = dynamic(
  () => import('@/components/model-viewer/model-viewer').then((module) => module.ModelViewer),
  {
    ssr: false,
    // The same bar as the model's own progress, so the indicator never jumps.
    loading: () => (
      <div
        role="progressbar"
        aria-label="Loading viewer"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1 animate-pulse bg-neutral-700"
      />
    ),
  },
);

export function AssetView({ id }: { id: string }): ReactNode {
  const endpoint = useGatewayEndpoint();
  const { data, error, status, refetch } = useQuery(assetQueryOptions(endpoint, id));
  const [modelLoaded, setModelLoaded] = useState(false);
  const handleModelLoaded = useCallback(() => {
    setModelLoaded(true);
  }, []);

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
  const posterUrl = previewImageUrl(data.asset.currentVersion);

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900">
        {posterUrl && (
          // Shown from the first paint and cross-faded into the model. A plain <img>: a public,
          // already-sized WebP (ADR 017).
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={posterUrl}
            alt=""
            className="pointer-events-none absolute inset-0 h-full w-full object-contain transition-opacity ease-out"
            style={{
              opacity: modelLoaded ? 0 : 1,
              transitionDuration: `${String(FADE_DURATION_MS)}ms`,
            }}
          />
        )}
        {downloadUrl ? (
          // A retry fetches the asset again, which signs a fresh URL.
          <div className="relative h-full">
            <ModelViewer
              url={downloadUrl.url}
              onRetry={() => void refetch()}
              onLoaded={handleModelLoaded}
            />
          </div>
        ) : (
          <p className="p-6 text-sm text-neutral-400">The file is still uploading.</p>
        )}
      </div>
      <AssetDetails asset={data.asset} />
    </div>
  );
}
