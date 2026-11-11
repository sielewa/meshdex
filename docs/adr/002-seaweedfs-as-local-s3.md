# ADR 002: SeaweedFS as the local S3 implementation

- **Status:** accepted
- **Date:** 2026-11-11

## Context

Production stores originals, optimized GLBs and thumbnails in AWS S3. Locally (docker compose, kind, integration tests) we need something that speaks the same S3 API, because:

- The browser uploads GLBs **directly to S3** with presigned multipart upload URLs; our services never proxy the file. This needs presigned URLs, multipart upload, bucket CORS and the `ETag` response header exposed to the browser.
- Several processes in different languages read and write the files (worker, ml-service in Python, web), and in Kubernetes they run in separate pods.

The two usual choices stopped being usable: MinIO no longer publishes community Docker images (its Docker Hub repositories were removed in September 2026 and the repo is archived), and LocalStack's image requires an account and auth token since release 2026.3.0.

Options considered:

1. **SeaweedFS:** long-lived Apache-2.0 project, documents presigned URLs, multipart upload and `PutBucketCors`; single container with the S3 gateway enabled.
2. **RustFS:** Apache-2.0 MinIO-like server, simplest setup, but 1.0 only since September 2026 and it states it doesn't cover the whole S3 API.
3. **Filesystem adapter of the storage port:** zero infrastructure, but it can't issue presigned URLs the browser uploads to, so the main upload path would differ from production (no dev/prod parity), and pods in Kubernetes don't share a directory.

## Decision

Use **SeaweedFS** (pinned image version) as the S3 implementation in docker compose, kind and integration tests. Application code always talks to S3 through the AWS SDK with the endpoint from config, behind the `OBJECT_STORAGE_PORT`. Unit tests use an in-memory fake of the port.

## Consequences

- The upload flow (presigned multipart, CORS, `ETag`) runs the same way locally and in AWS, so problems show up before deployment.
- Switching to another S3 implementation (e.g. RustFS) only changes the compose/Helm definition, never application code.
- SeaweedFS's S3 compatibility is broad but not identical to AWS; anything we rely on is covered by integration tests, and AWS-only features (e.g. S3 event notifications) are not used.
- Supply-chain lesson recorded here: dev dependencies can disappear overnight, so images are pinned to exact versions and swappable behind standard APIs.
