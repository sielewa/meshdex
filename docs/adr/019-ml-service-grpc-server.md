# ADR 019: ml-service gRPC server: threads, one model per process, standard health

- **Status:** accepted
- **Date:** 2026-11-13

## Context

ml-service has so far run only as a job (`migrate`, `reindex`, ADR 018). Search needs it as a server: the gateway calls `SearchAssets` (`meshdex.ml.v1.EmbeddingService`), which embeds the query text with CLIP and ranks assets with pgvector. Later the processing worker calls `EmbedAsset` on the same server.

Two things weren't decided. How the server runs requests concurrently: the embeddings repository and its connection pool are synchronous (psycopg 3), and one CLIP model sits in memory and on one device. And how it reports health: the other services answer the standard gRPC health protocol (`grpc.health.v1.Health`, asset-service through `grpc-health-check`), which Kubernetes gRPC probes speak natively.

## Decision

### Synchronous `grpc.server` with a thread pool

- `python -m ml_service serve` starts `grpc.server(ThreadPoolExecutor(GRPC_MAX_WORKERS))`, 8 threads by default. Each request runs on its own thread: database queries run in parallel through the existing psycopg pool, whose maximum must cover the threads.
- `maximum_concurrent_rpcs` bounds the requests in progress (default 32). Requests over it are refused with `RESOURCE_EXHAUSTED` at once, instead of queueing in memory without limit. The caller sees a retryable status.
- **One model per process, used by one thread at a time.** A lock around every model call keeps two requests from running the model concurrently. On one device that would not be faster, and torch on `mps` is not documented as thread-safe. While a thread holds the lock, torch releases the GIL during its kernels, so the other threads keep serving database work. A text query takes a few ms in the model, so the lock is short. The service scales with replicas, not with threads.
- Requests are validated in the servicer: an empty query or one over 500 characters, and a `limit` outside 1–100 (0 means the default of 20), give `INVALID_ARGUMENT`, like `ListAssets` does for `page_size`. CLIP reads at most 77 tokens, so a longer query would be truncated anyway; the character limit keeps tokenizer work per request bounded.

Considered: **`grpc.aio` (asyncio)**. It keeps many more connections open in less memory. But the repository would have to become async (or exist twice), and the bottleneck is the model, which runs on one thread either way. Per-request concurrency is limited by the model lock, not by threads, so asyncio would add a second programming model without raising throughput.

Dynamic batching of concurrent model calls (the contract mentions it for `EmbedAsset`) can be added later behind the same lock-guarded interface: the thread holding the lock would take every waiting request into one batch. It is not needed for one text query per search.

### Health: `grpcio-health-checking`

The official `grpcio-health-checking` package provides `HealthServicer`. As in asset-service, the empty service name is liveness ("the process serves") and `meshdex.ml.v1.EmbeddingService` is readiness ("send me traffic"). Both start `NOT_SERVING`. They become `SERVING` after the model has loaded and a database query has succeeded. Loading takes seconds, so Kubernetes gets a `startupProbe`.

Shutdown on SIGTERM/SIGINT: readiness goes `NOT_SERVING`, `server.stop(GRPC_SHUTDOWN_GRACE_S)` refuses new calls and gives the ones in progress up to that many seconds (default 10), then the database pool closes and the process exits.

Considered: **generating `grpc/health/v1/health.proto` with our script and writing the servicer ourselves**. No new dependency, but more code to maintain and a copy of a standard contract in the repository.

## Consequences

- New settings: `GRPC_URL` (listen address, as in asset-service), `GRPC_MAX_WORKERS`, `GRPC_MAX_CONCURRENT_RPCS`, `GRPC_SHUTDOWN_GRACE_S`. The gateway gets `ML_SERVICE_URL` and a search deadline.
- New dependency (user): `grpcio-health-checking`.
- `EmbedAsset` stays `UNIMPLEMENTED` until the processing worker exists; the reindex job covers embedding until then.
- The model lock caps one replica at one model call at a time. When search load needs more, the answer is more replicas (one model each), or dynamic batching.
