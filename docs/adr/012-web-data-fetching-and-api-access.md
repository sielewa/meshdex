# ADR 012: Web app data fetching and API access

- **Status:** accepted
- **Date:** 2026-11-12

## Context

The web app (Next.js App Router, React 19) shows asset lists and pages, uploads files and will later show live processing status. It talks only to the gateway's GraphQL API. Four choices shape every feature: where data is fetched, how the browser reaches the gateway, how GraphQL operations are typed, and how the code is tested.

## Decision

**Fetching: Server Components prefetch, TanStack Query owns the client cache.**
A page (server component) prefetches the data it shows first into a per-request QueryClient (`getServerQueryClient`) and passes the dehydrated cache to client components through `HydrationBoundary`. Client components read the same query (same key and query function) with TanStack Query and take over from there: further pages, mutations, upload progress, refetching. The first HTML already contains the data (no client-side request waterfall, ready for SSR/SEO work in Stage 6). Considered: client-only fetching — simpler, but a spinner on every page and a rewrite once SSR is needed.

**API access: browsers call the gateway directly (CORS), endpoints come from the runtime environment.**
The Next.js server uses `GATEWAY_INTERNAL_URL` (the gateway's Service inside the cluster), browsers use `PUBLIC_GATEWAY_URL`, allowed by the gateway's `CORS_ORIGINS`. The public URL is read on the server at request time and handed to client components through a React context, not through a `NEXT_PUBLIC_*` variable: Next.js inlines those into the bundle at build time, which would tie each image to one environment, against "same charts, only values differ" (architecture.md). Considered: proxying `/graphql` through Next.js rewrites — one origin and no CORS, but every API call takes an extra hop through the web server.

**Typing: GraphQL Code Generator (client preset) from `apps/gateway/schema.graphql` (ADR 011), plain `fetch`.**
Operations are written with `graphql()` next to the feature that uses them; the generated documents carry the result and variables types. `documentMode: 'string'` keeps the `graphql` library out of the browser bundle. No GraphQL client library: TanStack Query already caches by query key, and a normalized cache (Apollo Client, urql) isn't needed for this app's read patterns. Generated code is not committed; every web script runs the codegen first.

**Tests: Vitest + Testing Library** for units and components (native ESM, no Babel/SWC transform setup); Playwright for E2E (architecture.md). The Nest apps keep Jest (ADR 008).

**No third-party calls from build or runtime:** Next.js telemetry is disabled in every script, and fonts are system fonts (`next/font/google` downloads from Google at build time).

## Consequences

- Each page decides what is prefetched on the server; client components must use the same query options so the hydrated data is reused instead of refetched.
- The root layout renders per request (`connection()`), so pages are never statically prerendered. Fine for a data-driven app; revisit for static pages if any appear.
- The gateway must list the web origin in `CORS_ORIGINS` in every environment.
- A new GraphQL operation needs `pnpm --filter @meshdex/web codegen` (or `codegen:watch`) before its types exist.
