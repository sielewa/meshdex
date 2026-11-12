import type { ReactNode } from 'react';

/**
 * Skeleton of the asset grid while the home page renders. Also the prefetch boundary for the
 * header's home link: prefetching `/` from any page stops here instead of fetching the grid.
 */
export default function HomeLoading(): ReactNode {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="h-8 w-32 animate-pulse rounded bg-neutral-900" />
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {Array.from({ length: 12 }, (_, index) => (
          <li key={index} className="aspect-[3/4] animate-pulse rounded-lg bg-neutral-900" />
        ))}
      </ul>
    </div>
  );
}
