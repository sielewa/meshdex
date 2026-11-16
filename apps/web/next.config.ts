import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // No "X-Powered-By: Next.js" header: it only advertises the stack.
  poweredByHeader: false,
  // `<Link href>` is checked against the routes that exist, at compile time.
  typedRoutes: true,
  // `next dev` would write AGENTS.md into the app when it detects a coding agent: a generated
  // file in the working tree on every start. Project rules for agents live in .claude/ and docs/.
  agentRules: false,
};

export default nextConfig;
