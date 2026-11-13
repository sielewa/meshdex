import type { ReactNode } from 'react';

/** Shown while the search route renders and as the prefetch boundary of the header's form. */
export default function SearchLoading(): ReactNode {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="h-8 w-32 animate-pulse rounded bg-neutral-900" />
      <div className="h-9 max-w-md animate-pulse rounded bg-neutral-900" />
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {Array.from({ length: 12 }, (_, index) => (
          <li key={index} className="aspect-[3/4] animate-pulse rounded-lg bg-neutral-900" />
        ))}
      </ul>
    </div>
  );
}
