'use client';

import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { useCallback, useState, type ReactNode } from 'react';
import { useGatewayEndpoint } from '@/graphql/use-gateway-endpoint';
import { AssetDetails } from '@/features/assets/components/asset-details';
import { assetQueryOptions } from '@/features/assets/api/assets.queries';
import { previewImageUrl } from '@/features/assets/lib/preview-image-url';
import { FADE_DURATION_MS } from '@/components/model-viewer/model-viewer.constants';

/**
 * three.js and the viewer are a separate chunk, fetched only when this page renders, and
 * never rendered on the server (WebGL exists only in the browser).
 */
const ModelViewer = dynamic(
  () => import('@/components/model-viewer/model-viewer').then((module) => module.ModelViewer),
  {
    ssr: false,
    // While the viewer chunk downloads: the same thin bar at the bottom edge as the model's
    // own progress, so the loading indicator never moves or changes its look.
    loading: () => (
      <div
        role="progressbar"
        aria-label="Loading viewer"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1 animate-pulse bg-neutral-700"
      />
    ),
  },
);

/** The asset page body; data normally arrives hydrated from the page's server prefetch. */
export function AssetView({ id }: { id: string }): ReactNode {
  const endpoint = useGatewayEndpoint();
  const { data, error, status, refetch } = useQuery(assetQueryOptions(endpoint, id));
  const [modelLoaded, setModelLoaded] = useState(false);
  // Stable, so the model's "loaded" effect runs once, not after every render of this page.
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
          // The model's picture from the first paint, while three.js (a separate chunk) and the
          // GLB download. When the model is framed, the image fades out as the canvas fades in
          // (same duration), so the picture turns into the model instead of blinking away. A
          // plain <img>: a public, already-sized WebP (ADR 017); decorative, the page names it.
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
          // Positioned, so it paints above the still image. A retry fetches the asset again,
          // which signs a fresh URL (e.g. after expiry).
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
