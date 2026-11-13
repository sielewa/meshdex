# ADR 010: Media URLs for stored files

- **Status:** accepted; originals implemented (`GetOriginalDownloadUrls`, `AssetVersion.originalDownloadUrl`); public URLs implemented with the first public files, source previews (`StoredFile.url`, `MEDIA_BASE_URL`, prefix `public/`, ADR 017)
- **Date:** 2026-11-12

## Context

asset-service records stored files as object-storage keys (`StoredObject.key`); its contract leaves turning a key into a URL to callers. Browsers need URLs for thumbnails (asset grid) and for a GLB to show in the 3D viewer. The bucket holds two kinds of files: the **original** upload (private: the raw user file) and **derivatives** produced by the processing worker (optimized GLB, thumbnails), which are meant to be public and cacheable. Until the processing worker exists, only originals exist, so the viewer needs the original.

Options considered:

1. **Hybrid.** Public derivatives as `MEDIA_BASE_URL + key`, built in the gateway (CloudFront in the cloud, the S3 emulator's public path locally). The original stays private and is served through a short-lived presigned GET from a new asset-service RPC, resolved only where it is needed (the asset page).
2. **Everything through presigned GET.** asset-service signs every file (a batched RPC behind a DataLoader). One mechanism and a fully private bucket, but URLs change on every request, so neither the CDN nor the browser can cache thumbnails, and every grid page costs signing work.
3. **Everything public through the CDN.** Simplest and no contract change, but makes the original uploads public, contradicting the contract (`original` is "private; never served to browsers directly").

## Decision

Option 1 (hybrid).

- The gateway gets `MEDIA_BASE_URL` and adds `url` to `StoredFile` for derivatives (thumbnails, optimized model). It needs no storage credentials.
- asset-service gets a read RPC returning a presigned GET URL (with expiry) for a version's original; the gateway exposes it as a separate field resolved on demand, so lists never trigger signing.
- In the cloud only the derivatives' prefix is readable through CloudFront (origin access control); the original prefix stays private.

## Consequences

- Thumbnails and optimized models are cacheable by the CDN and browsers (stable URLs).
- Originals are never public; access is short-lived and goes through asset-service, which can later enforce authorization.
- Needs a proto change (new RPC, additive within `v1`), landing with the web asset page. Originals already live under their own key prefix (`originals/…`); the processing worker must write derivatives under a separate public prefix, so the CDN rule is a prefix match.
- Two URL mechanisms to understand instead of one.
