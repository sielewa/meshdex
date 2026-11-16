import type { ReactNode } from 'react';

/**
 * The page reads only bundled data, so this shows for a moment at most. It exists so the route
 * doesn't inherit the root boundary, which is a skeleton of the asset grid.
 */
export default function ExperimentsLoading(): ReactNode {
  return (
    <div className="space-y-8" aria-busy="true">
      <div className="h-8 w-40 animate-pulse rounded bg-neutral-900" />
      {Array.from({ length: 2 }, (_, index) => (
        <div key={index} className="h-96 animate-pulse rounded-lg bg-neutral-900" />
      ))}
    </div>
  );
}
