import type { ReactNode } from 'react';

/**
 * Shown instantly while the asset page renders. It is also the prefetch boundary: links to
 * this dynamic route prefetch only the layout and this skeleton, so a grid of 24 cards
 * doesn't make the server fetch (and sign URLs for) 24 assets nobody opened.
 */
export default function AssetLoading(): ReactNode {
  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]" aria-busy="true">
      <div className="aspect-[4/3] animate-pulse rounded-lg bg-neutral-900" />
      <div className="space-y-3">
        <div className="h-8 w-2/3 animate-pulse rounded bg-neutral-900" />
        <div className="h-4 w-1/3 animate-pulse rounded bg-neutral-900" />
        <div className="h-24 animate-pulse rounded bg-neutral-900" />
      </div>
    </div>
  );
}
