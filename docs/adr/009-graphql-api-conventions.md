# ADR 009: GraphQL API conventions

- **Status:** accepted; the snapshot-based schema review is superseded by [ADR 011](011-graphql-schema-file-as-contract.md)
- **Date:** 2026-11-12

## Context

The gateway is the only public API: the web app and future clients see GraphQL, never gRPC. The schema is built code-first (`@nestjs/graphql` decorators) on top of `meshdex.asset.v1`, whose list RPC returns one opaque `next_page_token` per page, whose sizes are `int64`, and whose upload RPCs hand out presigned URLs that expire. Several API-wide choices follow from that and must stay consistent as the schema grows.

## Decision

**Pagination: connection with `nodes` and `pageInfo`.**
`assets(first, after, …): AssetConnection { nodes, pageInfo { endCursor, hasNextPage } }`. `endCursor` is asset-service's page token, passed back as `after`. Considered: a plain `{ items, nextCursor }` page — fewer types and 1:1 with proto, but non-standard, and adding fields such as `totalCount` or backward paging later would mean a different shape. The Relay-style shape is what GraphQL clients and their infinite-scroll helpers expect; `edges { cursor node }` can be added without breaking anyone if per-item cursors ever exist.

**Errors: `extensions.code` from a fixed set.**
`BAD_USER_INPUT`, `NOT_FOUND`, `CONFLICT`, `SERVICE_UNAVAILABLE`, `INTERNAL_SERVER_ERROR` (`GraphqlErrorCode`). The mapping is two-step and stays in the transport layers: the gRPC adapter turns status codes into domain exceptions (`INVALID_ARGUMENT` → `InvalidAssetRequestException`, `FAILED_PRECONDITION` → `AssetStateConflictException`, `UNAVAILABLE`/`DEADLINE_EXCEEDED` → `AssetServiceUnavailableException`…), and each resolver maps the exceptions it can meet to GraphQL errors. Anything unmapped is masked as `INTERNAL_SERVER_ERROR` with a generic message and logged once (`GraphqlOptionsFactory.formatError`). A missing single entity is `null` (`asset(id)`), not an error.

**Numbers: `Float` for `int64` values.**
GraphQL `Int` is signed 32-bit, so byte sizes above 2 GiB would fail to serialize. `Float` is exact up to 2^53, the same bound the services already rely on (ts-proto `forceLong=number`). Considered: a custom `SafeInt`/`BigInt` scalar — more precise naming, but every client then needs a scalar mapping for little gain at our sizes.

**Times: one `DateTime` scalar, ISO 8601 UTC on the wire, epoch ms in code** (ADR 003). A custom scalar replaces the built-in one, which only serializes `Date` objects.

**Presigned URLs come from mutations.** `renewUploadPartUrls` changes no state but is a mutation, because GraphQL clients cache query results and a cached URL may already have expired.

**Validation split.** The gateway validates shape and cost bounds (UUID ids, `first ≤ 100`, array sizes); business rules (title/tag limits, accepted content type, maximum file size) are owned and enforced by asset-service and come back as `BAD_USER_INPUT`, so the rules never exist in two copies that can drift.

**The schema is reviewed as a snapshot.** The printed SDL is a Jest snapshot (`apps/gateway/test/__snapshots__`), so every contract change shows up in the diff of the change that caused it. No schema file is written at runtime (read-only file systems in Kubernetes).

## Consequences

- Clients get one predictable error contract; internal messages (database errors, host names) never leak.
- `sizeBytes` is a `Float` in generated client types; clients treat it as an integer.
- Adding a gRPC status the adapter doesn't know yields `INTERNAL_SERVER_ERROR` until it is mapped deliberately.
- Any schema change fails the snapshot test until the snapshot is updated (`jest -u`), which makes contract changes explicit in review.
