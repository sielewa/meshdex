import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import { getServerEnv } from '@/config/server-env';
import { AssetSearchForm } from '@/features/assets/components/asset-search-form';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Meshdex',
  description: '3D asset library with AI search',
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}): Promise<ReactNode> {
  // Render per request, so the public endpoint comes from the runtime environment
  // (ADR 012) instead of being frozen into prerendered HTML at build time.
  await connection();
  const { PUBLIC_GATEWAY_URL } = getServerEnv();

  return (
    <html lang="en">
      <body className="min-h-screen font-sans">
        <Providers gatewayEndpoint={PUBLIC_GATEWAY_URL}>
          <header className="border-b border-neutral-800">
            <nav className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-4">
              <Link href="/" className="text-lg font-semibold tracking-tight">
                Meshdex
              </Link>
              <Link href="/upload" className="text-sm text-neutral-300 hover:text-white">
                Upload
              </Link>
              <div className="ml-auto flex flex-1 justify-end">
                <AssetSearchForm />
              </div>
            </nav>
          </header>
          <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
          <footer className="border-t border-neutral-800">
            {/* Engineering view, kept out of the main navigation (ADR 015). */}
            <nav
              className="mx-auto flex max-w-6xl gap-6 px-4 py-6 text-sm"
              aria-label="Engineering"
            >
              <Link href="/experiments" className="text-neutral-500 hover:text-neutral-200">
                Experiments
              </Link>
            </nav>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
