# Architecture

Meshdex is a 3D asset library with AI search. Users upload 3D models (glTF/GLB). The system optimizes them, renders thumbnails, embeds them with CLIP and makes them searchable by natural-language text ("wooden industrial chair"). Models are previewed in the browser in 3D.

## Overview

```
                 ┌──────────────┐
  Browser ──────►│  web         │  Next.js (App Router), React Three Fiber, TanStack Query
                 └──────┬───────┘
                        │ GraphQL (queries, mutations, subscriptions/SSE)
                 ┌──────▼───────┐
                 │  gateway     │  NestJS, GraphQL code-first, auth (JWT), Redis cache
                 └──┬────────┬──┘
              gRPC  │        │  gRPC
         ┌──────────▼──┐  ┌──▼───────────┐
         │asset-service│  │  ml-service  │  Python, CLIP (open_clip), gRPC
         │NestJS + PG  │  │  + pgvector  │
         └──────┬──────┘  └──────▲───────┘
   outbox → Kafka│ asset.uploaded │ gRPC (embed)
         ┌──────▼──────────────────┴─┐
         │  processing-worker        │  Node.js: glTF-Transform optimize,
         │  (scaled by consumer lag) │  Puppeteer + three.js thumbnails
         └──────┬────────────────────┘
                │ S3 (originals, optimized GLB, thumbnails)
         ┌──────▼──────┐
         │   ingest    │  CLI/job: bulk import CC0 assets, benchmarks
         └─────────────┘
```

## Services and data ownership

| Service | Tech | Owns | Talks via |
|---|---|---|---|
| `web` | Next.js, React, R3F, TanStack Query, Tailwind | — | GraphQL → gateway |
| `gateway` | NestJS, GraphQL code-first | Redis cache only | gRPC → asset, ml |
| `asset-service` | NestJS, Drizzle, PostgreSQL | `assets`, `asset_versions`, `tags`, `outbox` | gRPC server; publishes events via outbox → Kafka |
| `processing-worker` | Node.js (NestJS standalone or plain TS), glTF-Transform, Puppeteer | `processed_events` (idempotency) | consumes Kafka; S3; gRPC → asset, ml |
| `ml-service` | Python, grpcio, open_clip, pgvector | `embeddings` | gRPC server |
| `ingest` | Node.js CLI | — | S3 + gRPC → asset |

**Rule:** each service owns its database (separate logical DBs; one Postgres instance is fine locally). No cross-service table access. Consistency between services is eventual and event-driven.

## Event flow (happy path)
1. `web` requests a presigned multipart upload URL from `gateway` → `asset-service`.
2. Browser uploads the GLB directly to S3.
3. `web` confirms upload → `asset-service` writes asset row **and** `asset.uploaded` event to `outbox` in **one transaction**.
4. Outbox relay publishes to Kafka topic `asset.events.v1`.
5. `processing-worker` consumes, checks `processed_events` (idempotency key = event id), optimizes model, renders N thumbnails, uploads to S3, calls `ml-service.Embed`, reports status back to `asset-service` (gRPC).
6. Status changes are pushed to `web` (GraphQL subscription or SSE).
7. Search: `web` → `gateway` → `ml-service.Search(text)` → asset ids → `asset-service.GetAssets` → response.

## Microservice patterns
Each one gets an ADR and a README section.
- **Transactional outbox** (asset-service → Kafka)
- **Idempotent consumers** (`processed_events` table)
- **Retries with backoff + dead-letter topic** (`asset.events.v1.dlq`)
- **Database per service**
- **Versioned gRPC contracts** (`package meshdex.asset.v1`), breaking-change check with `buf breaking` in CI
- **Distributed tracing** with OpenTelemetry across HTTP, gRPC and Kafka

## Tech stack
- Monorepo: **pnpm workspaces + Turborepo**
- Language: TypeScript (**strict**) everywhere except `ml-service` (Python 3.12)
- Runtime: Node.js current LTS
- Broker: **Kafka** (Redpanda locally — Kafka API compatible, single container)
- DB: **PostgreSQL** + **pgvector**; ORM **Drizzle** (SQL-close, pgvector support); migrations per service
- Object storage: **AWS S3**; locally an S3-compatible emulator (LocalStack or MinIO — whichever image currently works; S3 SDK with custom endpoint via env)
- Proto tooling: **buf** (lint, breaking, generate); TS codegen with `ts-proto`
- Testing: Jest + Supertest (Node), Testcontainers (integration), pytest (ml), Playwright (web E2E)
- Observability: OpenTelemetry SDK → Prometheus + Grafana (+ Tempo for traces, Loki for logs)
- Infra: Docker, Kubernetes (kind locally, k3s on EC2 in the cloud — [ADR 001](adr/001-k3s-on-ec2-instead-of-eks.md)), Helm, KEDA (worker scaled by Kafka lag), Terraform for AWS
- CI: GitLab CI (primary), mirrored to GitHub
- Dependencies pinned to exact versions (`.npmrc`)

## Deployment
Every service is built into its own image (`turbo prune <app> --docker`), CI builds and pushes only the services affected by a change, and each service is deployed as its own Helm release. The same charts run locally on kind and in the cloud on k3s; only values differ.

## Repository layout

```
apps/
  web/                    # Next.js
  gateway/                # NestJS GraphQL
  asset-service/          # NestJS gRPC
  processing-worker/
  ml-service/             # Python
  ingest/                 # CLI
packages/
  proto/                  # .proto files + buf config + generated TS
  shared/                 # shared TS infrastructure (logger, otel, config helpers, errors)
infra/
  docker/                 # compose files
  k8s/                    # Helm charts
  terraform/              # AWS
docs/
  adr/                    # decisions (index + pending decisions in adr/README.md)
  benchmarks/             # methodology + results (tables, charts)
  architecture.md
  conventions.md
  roadmap.md
tools/
  bench/                  # benchmark scripts (k6, custom Node scripts)
```

## Asset licensing
**CC0** sources only (Poly Haven, Kenney, Quaternius, Khronos glTF Sample Assets with a per-model license check). `ATTRIBUTION.md` lists source and license per imported set. Never assets with NC/ND licenses.
