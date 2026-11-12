'use client';

import type { ReactNode } from 'react';

/** Last-resort boundary for unexpected render errors; data errors are handled in place. */
export default function ErrorPage({ reset }: { error: Error; reset: () => void }): ReactNode {
  return (
    <div role="alert" className="space-y-3">
      <p className="text-red-300">Something went wrong.</p>
      <button type="button" onClick={reset} className="rounded bg-neutral-800 px-3 py-1.5 text-sm">
        Try again
      </button>
    </div>
  );
}
