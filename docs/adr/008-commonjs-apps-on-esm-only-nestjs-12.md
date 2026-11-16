# ADR 008: CommonJS apps on ESM-only NestJS 12

- **Status:** accepted (amends [ADR 004](004-commonjs-for-nestjs-apps-and-shared-packages.md))
- **Date:** 2026-11-12

## Context

ADR 004 chose CommonJS partly because "the NestJS CLI and Jest default to CommonJS". When the first app was built, NestJS 12 turned out to ship **only as ES modules** (`"type": "module"` in every `@nestjs/*` package). Two consequences were verified:

- **Runtime works:** Node 24 supports `require()` of ES modules without top-level `await`, so a CommonJS app loads NestJS 12 normally (build, start, gRPC health check and SIGTERM shutdown tested).
- **Jest fails by default:** Jest executes modules inside its own `vm` sandbox (for isolation and mocking), and ES modules inside `vm` need Node's experimental VM-modules API. Without `--experimental-vm-modules` every test importing NestJS fails with `ERR_REQUIRE_ESM`.

Options considered:

1. **Stay on CommonJS** and run Jest with `NODE_OPTIONS=--experimental-vm-modules`.
2. **Move apps and shared packages to ESM** (`"type": "module"`, `.js` suffixes on relative imports). Jest would still need the same flag (or a switch to Vitest with an SWC plugin for decorator metadata).

## Decision

Stay on **CommonJS** for now (option 1). Every NestJS app's `test` script is `NODE_OPTIONS=--experimental-vm-modules jest`. Revisit a move to ESM once the first end-to-end slice is finished, since ESM is where NestJS is heading.

## Consequences

- No import-suffix churn and no change of test runner during the first slice; everything already written keeps working.
- The codebase mixes module systems (CommonJS app code, ESM framework); `require(esm)` is stable in Node 24, but Jest relies on an experimental flag that may print warnings and could change between Node versions.
- The move to ESM, when it happens, is per package: `"type": "module"`, `.js` suffixes, and a test-runner decision — recorded in a new ADR.
