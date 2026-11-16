# ADR 005: Database schema conventions

- **Status:** accepted
- **Date:** 2026-11-11

## Context

Each service owns a PostgreSQL database accessed through Drizzle. Three things had to be fixed before the first schema: identifier casing, foreign keys, and where table definitions live in the code.

## Decision

### snake_case in the database, camelCase in code

Tables and columns are `snake_case` (`asset_versions.created_at`); TypeScript uses camelCase (`createdAt`). Drizzle maps between them automatically (`casing: 'snake_case'`).

Option considered: camelCase columns. Postgres folds unquoted identifiers to lower case, so every hand-written query, psql session and reporting tool would need `"createdAt"` in quotes. (camelCase works without quoting in MySQL, where column names are case-insensitive — it doesn't carry over to Postgres.)

### Foreign keys inside one service's database

Relations inside a service's database are enforced with foreign keys, and **every foreign-key column has its own index**. Between services there are no foreign keys (separate databases); consistency there is eventual, driven by events.

Option considered: integrity checked only in code. A "check that the parent exists, then insert" sequence races with a concurrent delete unless every path locks rows; a foreign key is checked atomically by the database on every path, including migrations and manual fixes.

### Table definitions belong to the service, repositories to feature modules

A microservice is one bounded context, and several feature modules may use the same table differently (e.g. upload and listing both use `assets`). Table definitions therefore live at service level, one file per table:

```
src/database/schema/assets.table.ts
src/database/schema/asset-versions.table.ts
src/database/schema/index.ts        # re-exports for the Drizzle client and drizzle-kit
```

Repositories stay in feature modules and import the tables they need. **Any module may read; writes that change an aggregate's state go through the module responsible for that aggregate's lifecycle**, so its rules (e.g. allowed status transitions) live in one place.

Option considered: tables next to the repository of an "owning" feature module — rejected because it implies one module per table, which doesn't match how features use data.

## Consequences

- Plain SQL against the database needs no quoting; the code keeps camelCase.
- Every INSERT/UPDATE of a child row checks the parent's index, and indexes on foreign-key columns cost write time and space — acceptable at our scale, and measured in the Stage 4 bulk-loading benchmark (load with constraints vs. add them after the load).
- Bulk loads must respect parent → child order (or defer constraints).
- Schema files are shared within the service, so ownership of writes is a code-review rule, not something the compiler enforces.
