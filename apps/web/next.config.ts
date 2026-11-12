import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // No "X-Powered-By: Next.js" header: it only advertises the stack.
  poweredByHeader: false,
  // `<Link href>` is checked against the routes that exist, at compile time.
  typedRoutes: true,
};

export default nextConfig;
