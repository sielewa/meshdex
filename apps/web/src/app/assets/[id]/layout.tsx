import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { z } from 'zod';

/**
 * Above the `loading.tsx` boundary the status is still open, so a malformed id gets a real 404.
 * No data is fetched here: layouts also run for link prefetches.
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
