# ADR 011: GraphQL schema file as the contract artifact

- **Status:** accepted (supersedes the "schema is reviewed as a snapshot" part of ADR 009)
- **Date:** 2026-11-12

## Context

ADR 009 kept the printed SDL as a Jest snapshot. The web app now needs the schema as input for GraphQL Code Generator, which produces typed documents for every query and mutation it uses. A Jest snapshot is a JavaScript file with escaped content: tools can't read it as a schema, and it lives in a test directory nobody would look for.

Options considered:

1. **A committed `apps/gateway/schema.graphql`**, kept in sync with the code-first schema by a test.
2. **Introspection of a running gateway** by the codegen. No extra file, but generating the web types (locally, in CI and in every build) then needs a running gateway with introspection enabled.

## Decision

Option 1.

- `apps/gateway/schema.graphql` is the printed schema with a "generated, do not edit" header. It is excluded from Prettier, so the file stays byte-for-byte what `printSchema` produces.
- The gateway's e2e test (`test/graphql-api.spec.ts`) fails when the running schema and the file differ; `UPDATE_SCHEMA=true pnpm --filter @meshdex/gateway test -- graphql-api` rewrites the file.
- The web app's codegen reads the file directly, so building or type-checking the web needs no running service. Contract changes appear in review as a readable SDL diff next to the code that caused them.
- The gateway still never writes the file at runtime (read-only file systems in Kubernetes).

## Consequences

- One source of truth stays the code (decorators); the file is a checked derivative, like a lockfile.
- A schema change is a two-step edit (code, then regenerate the file); forgetting the second step fails the gateway's tests.
- The web build depends on a file in another app; Turbo must list it as an input of the web's tasks so cached results are invalidated when the schema changes.
