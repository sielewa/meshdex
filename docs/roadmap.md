# Roadmap

A stage is finished when its "Done when" holds and `README.md`/`docs/` describe what exists.

## Current focus: end-to-end slice first

Before the processing pipeline, the system gets a thin but complete slice across every layer, so it is usable and measurable early. Order:

1. `asset-service` (gRPC) + `gateway` (GraphQL) — Stage 1
2. `web`: upload with parallel parts and progress, asset grid, 3D viewer (R3F) — from Stage 5
3. `ingest` with streaming/backpressure + **Experiments**: benchmark runs are recorded in the system and compared in the web UI (charts per configuration) — from Stage 4
4. Minimal `ml-service`: CLIP embeddings of source preview images, text search, batch-size experiment — from Stage 5
5. Docker images + kind + Helm for the services that exist — from Stage 3

Then the remaining stages continue in order (processing worker with Kafka/outbox, KEDA, auth, cloud).

## Stage 1 — Skeleton & contracts

- [x] Monorepo, lint/format, `docker compose up` with Postgres, Redpanda, S3 emulator (SeaweedFS)
- [x] `packages/proto`: `meshdex/asset/v1/asset.proto`, `meshdex/ml/v1/ml.proto`; buf lint + generate (ts-proto, NestJS types)
- [x] `asset-service`: upload RPCs (CreateAsset became InitiateUpload/CompleteUpload), GetAsset, BatchGetAssets, ListAssets (keyset pagination, tag/status filters), StartProcessing/CompleteProcessing (idempotent, replaces UpdateStatus); Drizzle schema + migrations
- [ ] `asset-service` integration tests with Testcontainers (turn the local end-to-end check into an automated test)
- [x] `gateway`: GraphQL schema (code-first) for assets ([ADR 009](adr/009-graphql-api-conventions.md)); calls asset-service over gRPC with deadlines/retries in the service config; DataLoader batching; HTTP health probes
- [x] Presigned multipart upload flow (asset-service side: initiate, re-sign parts, complete, abort; outbox event on completion)
- [ ] Stale-uploads reconciler: periodic job for versions stuck in UPLOADING (client vanished) — HEAD the object, then mark uploaded (+ outbox event) or abort and delete
- **Done when:** a GLB can be uploaded and listed via GraphQL.

## Stage 2 — Processing pipeline

- [ ] Outbox table + relay → Kafka
- [ ] `processing-worker`: idempotency, glTF-Transform (Draco, texture resize), thumbnails via Puppeteer + three.js (headless WebGL / SwiftShader; fallback: Blender headless — ask first)
- [ ] Retry + DLQ
- [ ] Integration test: kill broker mid-processing → nothing lost, nothing processed twice
- **Done when:** upload → optimized GLB + thumbnails in S3, status = READY.

## Stage 3 — Local Kubernetes

- [ ] Dockerfile per service: multi-stage, `turbo prune <app> --docker`, non-root user, small runtime image
- [ ] kind cluster config + loading/pushing local images; one command/script brings the whole system up
- [ ] Helm chart per service: Deployment, Service, ConfigMap/Secret (only that service's env), liveness/readiness probes wired to `health/`, resource requests/limits, `terminationGracePeriodSeconds` matching graceful shutdown
- [ ] Infrastructure in the cluster: Postgres (+ pgvector), Redpanda, S3 emulator
- [ ] KEDA `ScaledObject` scaling `processing-worker` by consumer lag on `asset.events.v1`
- **Done when:** the full upload → READY flow works inside kind, and a burst of uploads visibly scales the worker out and back in.

## Stage 4 — Ingest & benchmarks

- [ ] `ingest` CLI: bulk import from Poly Haven API (CC0) and/or Kenney/Quaternius packs; streaming, bounded concurrency, backpressure, resumable
- [ ] Bulk DB loading: row-by-row vs. batched inserts vs. `COPY` when importing thousands of assets
- [ ] Benchmarks in `docs/benchmarks/`: throughput & memory vs concurrency; buffered vs streamed; worker replicas (KEDA, inside kind with resource limits) vs processing time; DB loading methods. Methodology (warm-up, repeated runs, p50/p95/p99, variance) + environment description + raw results + conclusions.
- **Done when:** README links a benchmark report with real numbers measured in the Kubernetes environment.

## Stage 5 — ML search + minimal web

- [ ] `ml-service`: CLIP image + text embeddings, pgvector search, batched `Embed`; benchmark batch size vs latency
- [ ] Reindex job as a data-loading pipeline: thumbnails streamed from S3 with prefetch, parallel decode/resize, batching into the model; benchmark throughput vs workers / batch size / prefetch depth and identify the bottleneck (I/O, decode or model)
- [ ] Search quality evaluation: small labelled query set, recall@k, two CLIP models and two pgvector index types (HNSW vs IVFFlat) compared on recall vs latency; reproducible with one command, report in `docs/benchmarks/`
- [ ] `web`: search page, asset grid with thumbnails, 3D viewer (R3F), upload with progress
- **Done when:** text search returns relevant models in the UI, and the reindex and evaluation reports have real numbers.

## Stage 6 — Fullstack polish

- [ ] Auth (JWT, then one OAuth provider)
- [ ] Live processing status (subscription/SSE), Redis cache
- [ ] Playwright E2E, accessibility & Core Web Vitals pass
- [ ] SSR/ISR asset pages with metadata (SEO)

## Stage 7 — Cloud & operations

- [ ] Terraform: **AWS Budget alert first**, then S3 (with an `AbortIncompleteMultipartUpload` lifecycle rule and CORS for the web origin), CloudFront, ECR, EC2 with k3s ([ADR 001](adr/001-k3s-on-ec2-instead-of-eks.md)), IAM least privilege
- [ ] Deploy the Stage 3 Helm charts to k3s on EC2 unchanged (only values differ)
- [ ] OpenTelemetry → Grafana dashboards (screenshots in README)
- [ ] k6 load test; GitLab CI: lint, test, buf breaking, build changed services only, push images
- [ ] Public live demo URL
