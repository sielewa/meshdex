# ADR 017: Source preview images and the public key prefix

- **Status:** accepted
- **Date:** 2026-11-13

## Context

The asset grid shows "No preview yet" on every card: thumbnails are rendered by the processing worker (Stage 2), which doesn't exist yet. Search needs images too: CLIP embeds images and text into one space, so a model is found by text through a picture of it. Models imported from Poly Haven come with a render made by their authors, a better picture than any automatic render, and the plan for the first search (roadmap, priority 4) is to embed exactly these "source preview images". The contract has no place for an image that arrives with an upload: `AssetVersion.thumbnails` is filled by the worker when processing succeeds.

ADR 010 decided that derivative files (thumbnails, optimized models) are public and cacheable, served as `MEDIA_BASE_URL + key`, under a key prefix separate from the private originals. That prefix was never fixed, because no public file existed yet.

## Decision

**An optional source preview image is part of the upload.** `InitiateUploadRequest.source_preview` declares an image (PNG, JPEG or WebP, at most 2 MB) next to the model; the response carries one presigned PUT URL for it (`source_preview_upload`), valid as long as the part URLs. `CompleteUpload` checks with a HEAD request that the image is stored with the declared size and records it on the version (`AssetVersion.source_preview`); a declared image that is missing fails the call with `FAILED_PRECONDITION`, like a missing part, and the client can retry or abort. A version therefore either has the image it declared or doesn't complete: there is no state where a model waits for its picture. There is no RPC to re-sign the image URL: it is one small PUT made right after `InitiateUpload`, and a client whose URL expired aborts and starts again.

**Every public file lives under `public/`.** Source previews are stored at `public/previews/<asset id>/<version id>.<png|jpg|webp>`; the worker will write thumbnails and optimized models under `public/` too. Originals stay under `originals/`. One prefix means one rule for public reads: CloudFront with origin access control for `public/*` in the cloud, an anonymous read identity scoped to `public/` in local SeaweedFS. The gateway builds the URL as `MEDIA_BASE_URL + key` (ADR 010) and needs no storage credentials.

**What is shown and embedded.** A card shows the worker's thumbnail once the version is READY, otherwise the source preview, otherwise a placeholder. The ml-service embeds the source preview until thumbnails exist; which image it embeds once both exist is decided with the processing worker.

**Ingest supplies Poly Haven's render.** `ingest fetch` also downloads each model's thumbnail from Poly Haven's CDN (`cdn.polyhaven.com`) into the cache, with the same User-Agent and parallel-request limit as the API, and `ingest import` uploads it as the source preview.

Considered: **separate RPCs to attach an image to an existing version** (`InitiatePreviewUpload`, `CompletePreviewUpload`). Images could be added to assets imported before this change and replaced later, but it adds two RPCs and a version that exists without the image it is going to get. Already imported assets are re-imported locally instead.

## Consequences

- Additive change within `meshdex.asset.v1` (new fields 6/5/12, new messages `ImageUpload`, `PresignedUrl`); `buf breaking` passes.
- Uploads from the web form send no image for now; they show the placeholder until the worker renders thumbnails.
- Local SeaweedFS gets an anonymous identity with read access to the bucket's `public/` prefix, and the gateway gets `MEDIA_BASE_URL`; ADR 010's derivative URLs become real with the first public file.
- Images uploaded by users will be untrusted input served from our origin: only the three image types are accepted, the stored `Content-Type` is the declared one, and SVG is not allowed (it can carry scripts).
- Poly Haven renders are CC0 like the models; the Poly Haven credit required by ADR 013 covers them.
