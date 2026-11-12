import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import { getServerEnv } from '@/config/server-env';
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
            </nav>
          </header>
          <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
