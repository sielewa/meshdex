import Link from 'next/link';
import type { ReactNode } from 'react';
import type { AssetsPageQuery } from '@/graphql/gql/graphql';
import { formatBytes } from '@/lib/format-bytes';
import { formatDate } from '@/lib/format-date';
import { AssetStatusBadge } from './asset-status-badge';

type AssetListItem = AssetsPageQuery['assets']['nodes'][number];

export function AssetCard({ asset }: { asset: AssetListItem }): ReactNode {
  return (
    <Link
      href={`/assets/${asset.id}`}
      className="flex h-full flex-col overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 transition-colors hover:border-neutral-600"
    >
      {/* Thumbnails exist once the processing worker renders them (Stage 2). */}
      <div className="flex aspect-square items-center justify-center bg-neutral-800 text-sm text-neutral-500">
        No preview yet
      </div>
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
