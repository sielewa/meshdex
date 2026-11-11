# Roadmap

Stages are done in order. A stage is finished when its "Done when" holds and `README.md`/`docs/` describe what exists.

## Stage 1 — Skeleton & contracts

- [x] Monorepo, lint/format, `docker compose up` with Postgres, Redpanda, S3 emulator (SeaweedFS)
- [ ] `packages/proto`: `asset/v1/asset.proto`, `ml/v1/ml.proto`; buf lint + generate
- [ ] `asset-service`: CreateAsset, GetAsset(s), ListAssets, UpdateStatus; Drizzle schema + migrations
- [ ] `gateway`: GraphQL schema (code-first) for assets; calls asset-service over gRPC
- [ ] Presigned multipart upload flow
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
- [ ] Benchmarks in `docs/benchmarks/`: throughput & memory vs concurrency; buffered vs streamed; worker replicas (KEDA, inside kind with resource limits) vs processing time. Methodology + environment description + raw results + conclusions.
- **Done when:** README links a benchmark report with real numbers measured in the Kubernetes environment.

## Stage 5 — ML search + minimal web

- [ ] `ml-service`: CLIP image + text embeddings, pgvector search, batching; benchmark batch size vs latency
- [ ] `web`: search page, asset grid with thumbnails, 3D viewer (R3F), upload with progress
- **Done when:** text search returns relevant models in the UI.

## Stage 6 — Fullstack polish

- [ ] Auth (JWT, then one OAuth provider)
- [ ] Live processing status (subscription/SSE), Redis cache
- [ ] Playwright E2E, accessibility & Core Web Vitals pass
- [ ] SSR/ISR asset pages with metadata (SEO)

## Stage 7 — Cloud & operations

- [ ] Terraform: **AWS Budget alert first**, then S3, CloudFront, ECR, EC2 with k3s ([ADR 001](adr/001-k3s-on-ec2-instead-of-eks.md)), IAM least privilege
- [ ] Deploy the Stage 3 Helm charts to k3s on EC2 unchanged (only values differ)
- [ ] OpenTelemetry → Grafana dashboards (screenshots in README)
- [ ] k6 load test; GitLab CI: lint, test, buf breaking, build changed services only, push images
- [ ] Public live demo URL
