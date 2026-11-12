import type { ReactNode } from 'react';

/**
 * Shown while the route renders (the root layout renders per request). Without it the route
 * would inherit the root boundary, a skeleton of the asset grid.
 */
export default function UploadLoading(): ReactNode {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="h-8 w-48 animate-pulse rounded bg-neutral-900" />
      <div className="h-64 max-w-xl animate-pulse rounded-lg bg-neutral-900" />
    </div>
  );
}
