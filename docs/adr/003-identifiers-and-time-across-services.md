# ADR 003: Identifiers and time across service boundaries

- **Status:** accepted
- **Date:** 2026-11-11

## Context

Identifiers and timestamps travel between services: an asset id is part of S3 keys, the Kafka message key, the ml-service `embeddings` table, GraphQL and URLs; event ids are idempotency keys in consumers. Contracts are read by TypeScript and Python. Some ids must exist **before** the row is inserted (the presigned upload URL contains the asset id; an outbox event needs its id when it is written).

## Decision

### Identifiers

Chosen per table by one rule:

| When                                                   | Key                                                    | Examples                                                            |
| ------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------- |
| The id leaves the service, or is needed before INSERT  | **UUIDv7**, Postgres type `uuid`, generated in the app | `assets`, `asset_versions`, outbox `event_id`, `users`              |
| The data has a natural (possibly composite) key        | natural key                                            | `embeddings` (`asset_id`, `model`), `processed_events` (`event_id`) |
| The id never leaves its table and nothing refers to it | `bigint` identity                                      | outbox publish order (`sequence`)                                   |

In proto, UUIDs are `string` in canonical text form (readable in logs, GraphQL `ID`, URLs, Redpanda Console).

Options considered for the first row: `bigint` identity (DB-generated, enumerable in URLs, only unique per table), UUIDv4 (random inserts fragment B-tree indexes), UUIDv7 (time-ordered prefix, so inserts append like a sequence).

### Time

- **Contracts (proto):** `google.protobuf.Timestamp` — a UTC instant (seconds + nanos since the Unix epoch) whose meaning is carried by the type, so TypeScript and Python can't disagree about seconds vs. milliseconds.
- **Inside services:** `number` of milliseconds since the epoch; conversion happens only at boundaries (proto mappers via one helper pair in `packages/shared`, repositories for the DB).
- **Database:** `timestamptz`, stored in UTC.

Option considered: `int64` milliseconds in contracts with a `_ms` suffix — equally safe regarding time zones, but the unit lives only in naming discipline, which is easy to break across languages (Python's `datetime.timestamp()` returns seconds).

## Consequences

- Ids can be generated before any DB round trip, are globally unique and safe in public URLs.
- **Cost of UUIDs:** keys are 16 bytes instead of 8, so primary and foreign-key indexes are larger and fewer entries fit in a page and in memory. Lookups stay B-tree lookups, but at hundreds of millions of rows this is a real memory cost to revisit (e.g. internal `bigint` keys with the UUID as a separate public column). UUIDv7 avoids the index fragmentation of random UUIDs.
- UUIDv7 leaks creation time (millisecond precision); acceptable for assets.
- The outbox relay orders by `sequence`, not by `event_id`, because two UUIDv7 values from the same millisecond have no guaranteed order.
- Every proto mapper converts `Timestamp` ⇄ ms; precision below a millisecond is dropped.
