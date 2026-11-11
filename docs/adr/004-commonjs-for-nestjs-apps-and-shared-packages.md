# ADR 004: CommonJS for NestJS apps and shared packages

- **Status:** accepted
- **Date:** 2026-11-11

## Context

The Node services (`gateway`, `asset-service`, `processing-worker`, `ingest`) and the shared packages they import (`packages/proto`, `packages/shared`) need one module system. The root `package.json` has `"type": "module"`, which only affects JavaScript config files in the repo root.

Options considered:

1. **CommonJS:** the default of the NestJS CLI and Jest; extensionless relative imports; decorators and `emitDecoratorMetadata` work without extra setup.
2. **ESM (`"type": "module"`, `nodenext`):** the long-term direction of the ecosystem, but every relative import needs a `.js` suffix, Jest needs experimental VM-module flags (or a switch of test runner), and some Nest tooling still assumes CommonJS.

## Decision

Use **CommonJS** for the NestJS apps and every shared package they consume: each such package sets `"type": "commonjs"` in its `package.json` and compiles with `"module": "nodenext"` (TypeScript emits CommonJS for CommonJS packages). `web` (Next.js) follows its own framework defaults.

## Consequences

- NestJS CLI, Jest and decorator metadata work with their defaults; no `.js` suffixes in imports.
- ESM-only dependencies are still usable: Node 24 supports `require()` of synchronous ES modules without flags.
- `"module": "nodenext"` keeps TypeScript's module checks strict (and avoids the `node10` resolution deprecated in TypeScript 6); a later move to ESM is a per-package change of `"type"` plus import suffixes, not a rewrite.
