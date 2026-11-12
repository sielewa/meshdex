import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { z } from 'zod';

/**
 * Rejects malformed ids above the `loading.tsx` boundary, where the HTTP status is still
 * open: a real 404. Below it the response is already streaming with 200, so an id that is
 * well-formed but unknown gets Next.js' soft 404 (not-found page + `noindex`), see page.tsx.
 * Format check only — no data is fetched here, because layouts also run for link prefetches.
 */
export default async function AssetLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}): Promise<ReactNode> {
  const { id } = await params;

  if (!z.uuid().safeParse(id).success) {
    notFound();
  }

  return children;
}
