import type { ReactNode } from 'react';
import type { AssetPageQuery } from '@/graphql/gql/graphql';
import { formatBytes } from '@/lib/format-bytes';
import { formatCount } from '@/lib/format-count';
import { formatDate } from '@/lib/format-date';
import { AssetStatusBadge } from './asset-status-badge';

type AssetDetail = NonNullable<AssetPageQuery['asset']>;

/** Metadata next to the viewer: what was uploaded and where processing stands. */
export function AssetDetails({ asset }: { asset: AssetDetail }): ReactNode {
  const version = asset.currentVersion;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold">{asset.title}</h1>
        <AssetStatusBadge status={asset.status} />
      </div>
      {asset.tags.length > 0 && (
        <ul className="flex flex-wrap gap-1" aria-label="Tags">
          {asset.tags.map((tag) => (
            <li key={tag} className="rounded bg-neutral-800 px-2 py-0.5 text-sm text-neutral-300">
              {tag}
            </li>
          ))}
        </ul>
      )}
      {version.failureReason !== null && (
        <p role="alert" className="rounded bg-red-950 p-3 text-sm text-red-200">
          Processing failed: {version.failureReason}
        </p>
      )}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-neutral-500">Version</dt>
        <dd>v{version.number}</dd>
        <dt className="text-neutral-500">File</dt>
        <dd>
          {formatBytes(version.original.sizeBytes)} · {version.original.contentType}
        </dd>
        <dt className="text-neutral-500">Uploaded</dt>
        <dd>
          <time dateTime={version.createdAt}>{formatDate(version.createdAt)}</time>
        </dd>
        {version.stats && (
          <>
            <dt className="text-neutral-500">Triangles</dt>
            <dd>{formatCount(version.stats.triangleCount)}</dd>
            <dt className="text-neutral-500">Vertices</dt>
            <dd>{formatCount(version.stats.vertexCount)}</dd>
            <dt className="text-neutral-500">Meshes / textures</dt>
            <dd>
              {formatCount(version.stats.meshCount)} / {formatCount(version.stats.textureCount)}
            </dd>
          </>
        )}
      </dl>
    </div>
  );
}
