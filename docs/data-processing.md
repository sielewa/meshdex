# Data loading and processing

How Meshdex moves and processes data efficiently. Every technique used in the code gets an entry here: **what** it is, **where** it lives, **why** this way (and what the alternative was), and the **benchmark** that backs it. Entries are added in the same commit as the code that introduces them.

## Principles

- **Bytes never pass through services that don't need them.** Large files go browser → S3 directly; services exchange ids and metadata.
- **Stream, don't buffer**, unless a library needs the whole object in memory — then say so and bound it.
- **Bounded concurrency everywhere.** Every fan-out (S3 parts, ingest downloads, worker jobs, DB writes) has an explicit limit.
- **Backpressure over queues in memory.** A slow consumer slows the producer (pause the Kafka consumer, stream `highWaterMark`) instead of growing a buffer.
- **Batch at boundaries.** Fetch many by id in one call, insert many rows in one statement, embed many images in one model call.
- **Measure before and after.** Claims about performance link to a report in `docs/benchmarks/`.

## Techniques

| Technique                           | Where                                                                                          | Why                                                                                                                                                                                                                                                                                                              | Benchmark                                                                                         |
| ----------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Keyset (cursor) pagination          | `assets_created_at_id_idx` (`asset-service/src/database/schema/assets.table.ts`), `ListAssets` | `OFFSET n` reads and discards `n` rows, so each page gets slower and pages shift when rows are inserted; a cursor `(created_at, id) < (…)` jumps straight into the index. The index's NULLS order must match the query's (`DESC` = `NULLS FIRST`), otherwise Postgres sorts in memory even on `NOT NULL` columns | `EXPLAIN`: `Index Only Scan` with no `Sort` node (verified locally); timing vs. offset in Stage 4 |
| Connection pool as a per-pod budget | `asset-service/src/database/database.module.ts`                                                | One `pg.Pool` per process; total connections = pool max × replicas, which must stay below Postgres' `max_connections` when the service scales out                                                                                                                                                                | —                                                                                                 |
| Partial index for the outbox relay  | `outbox_unpublished_idx` (`outbox.table.ts`)                                                   | The relay only scans unpublished rows; indexing just those keeps the index tiny however large the table grows                                                                                                                                                                                                    | —                                                                                                 |
