# ADR 015: Experiments page: runs bundled at build time, charts as server-rendered SVG

- **Status:** accepted
- **Date:** 2026-11-12

## Context

ADR 014 keeps selected benchmark runs as JSON files in `docs/benchmarks/runs/` and says the web app's Experiments page reads them when it is built. The page compares configurations of the same workload: every run as a point, the median per configuration, and later a curve when one numeric option is swept (e.g. upload concurrency). It is an engineering view of how Meshdex processes data, not a product feature for people browsing assets. Two choices remain: how the files reach the page, and how the charts are drawn.

## Decision

**Runs are bundled at build time.** `apps/web/scripts/collect-benchmark-runs.ts` concatenates the run files into `src/features/experiments/api/benchmark-runs.generated.json` (not committed). The web `generate` script runs it after the GraphQL codegen, before `dev`, `build`, `typecheck`, `lint` and `test`. The page imports the bundle like code and parses it with a zod schema once per server process (ADR 007: zod in the web app). A unit test parses every committed run with the same schema, so a malformed record fails the tests and the build, not a request. `docs/benchmarks/runs/**` is part of the web tasks' `inputs` in `turbo.json`, so a new run invalidates Turbo's cached build.

Considered: **reading the directory at request time** (path from an environment variable, cached in memory). New runs would show up without a restart in development and `package.json` would stay as it was. But the runtime image would have to ship the files and the variable, a bad file would surface only when the page is requested, and the page could show runs that don't belong to the commit it was built from.

**Charts are SVG rendered by server components**, written in the app (a linear scale, axes, points, median marks), with no chart library. A chart has tens of points, so the DOM is not a cost. The chart is in the first HTML with no JavaScript sent for it, follows the light and dark theme through CSS, is readable by assistive technology, and hover details need only CSS or `<title>`.

Considered: **Canvas.** It draws pixels from JavaScript, so it would need a client component, appear only after hydration, and need its own handling of pixel density, resizing, theme changes, hit testing for hover and an accessible fallback. It pays off from thousands of elements or with per-frame animation; a chart of that size (e.g. per-sample event-loop delay) can use Canvas as a separate component. **Recharts** gives ready axes and tooltips but is a dependency, runs on the client (it measures the DOM), and has no ready chart of individual runs with a median.

**The page is linked as an engineering view** (footer, not the main navigation), with a short note on what it measures and a link to the reports' methodology.

## Consequences

- Seeing a new run needs a rebuild (in development, a restart of `pnpm dev`), which matches how runs are added: recorded, then committed.
- The web build context must contain `docs/benchmarks/runs/` (already stated in ADR 014).
- The record schema in the web app duplicates the record format written by `ingest`. A format change bumps `version` and fails the schema test until the web app understands it.
- Chart code (scales, axes) is ours to maintain; a library is reconsidered if charts need zooming, brushing or many chart types.
