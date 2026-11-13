import Link from 'next/link';
import type { ReactNode } from 'react';
import type { AssetsPageQuery } from '@/graphql/gql/graphql';
import { formatBytes } from '@/lib/format-bytes';
import { formatDate } from '@/lib/format-date';
import { AssetStatusBadge } from '@/features/assets/components/asset-status-badge';
import { PREVIEW_IMAGE_SIZE_PX } from '@/features/assets/assets.constants';
import { previewImageUrl } from '@/features/assets/lib/preview-image-url';

type AssetListItem = AssetsPageQuery['assets']['nodes'][number];

export function AssetCard({ asset }: { asset: AssetListItem }): ReactNode {
  const imageUrl = previewImageUrl(asset.currentVersion);

  return (
    <Link
      href={`/assets/${asset.id}`}
      className="flex h-full flex-col overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 transition-colors hover:border-neutral-600"
    >
      {imageUrl ? (
        // A plain <img>, not next/image: the file is already a 512 px WebP from our media host
        // (ADR 017), and Next's optimizer would need that host in the build-time config.
        // Decorative (alt=""): the title right below names the model. Lazy: a page of 24 cards
        // loads only the images near the viewport. Width and height reserve the square, so
        // the grid doesn't shift while images arrive.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          width={PREVIEW_IMAGE_SIZE_PX}
          height={PREVIEW_IMAGE_SIZE_PX}
          loading="lazy"
          decoding="async"
          className="aspect-square w-full bg-neutral-800 object-cover"
        />
      ) : (
        // Shown until the processing worker renders thumbnails (Stage 2), e.g. for browser uploads.
        <div className="flex aspect-square items-center justify-center bg-neutral-800 text-sm text-neutral-500">
          No preview yet
        </div>
      )}
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <h2 className="line-clamp-2 font-medium">{asset.title}</h2>
          <AssetStatusBadge status={asset.status} />
        </div>
        {asset.tags.length > 0 && (
          <ul className="flex flex-wrap gap-1" aria-label="Tags">
            {asset.tags.map((tag) => (
              <li
                key={tag}
                className="rounded bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-400"
              >
                {tag}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-auto text-xs text-neutral-500">
          {formatBytes(asset.currentVersion.original.sizeBytes)} · v{asset.currentVersion.number} ·{' '}
          <time dateTime={asset.createdAt}>{formatDate(asset.createdAt)}</time>
        </p>
      </div>
    </Link>
  );
}
