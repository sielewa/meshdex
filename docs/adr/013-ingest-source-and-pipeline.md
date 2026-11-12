# ADR 013: Ingest source and pipeline

- **Status:** accepted
- **Date:** 2026-11-12

## Context

`ingest` bulk-imports CC0 models so the library has real content, and it is the main subject of the Stage 4 benchmarks (throughput and memory vs. concurrency, buffered vs. streamed). Three choices shape it: where the models come from, how they become the single GLB file the upload flow accepts, and how the work is split so that measurements are repeatable.

## Decision

**Source: the Poly Haven public API.**
All Poly Haven assets are CC0, and since July 2026 the API is free for any use, including commercial. The API lists models with names, categories and tags, and lists every file with its URL, size and MD5. Its terms require a User-Agent that names the software (`meshdex-ingest/<version>`) and a visible note that the content comes from Poly Haven: imported assets get the `polyhaven` tag and the asset page shows the credit. Considered: model packs downloaded by hand (Kenney, Quaternius), which already ship as GLB. No network stage and no format work, but every import starts with manual downloads, and the pipeline would be a plain file → upload copy with nothing CPU-bound to measure.

**Format: glTF packed into GLB inside `ingest`, with `@gltf-transform/core`.**
Poly Haven serves models as a `.gltf` file with separate `.bin` and texture files; there is no `.glb`. Packing is not a format conversion (same glTF 2.0 content, one binary container), so it stays within the glTF-only scope. `NodeIO` reads the `.gltf` with its resources and writes GLB bytes. The library is the reference toolkit for glTF in JavaScript, and the processing worker will need it again (optimization, texture resizing). Packing needs the whole model in memory; this is bounded by the chosen texture resolution (1k by default) and by the pipeline's concurrency limit, and is documented in `data-processing.md`. Considered: a hand-written GLB writer (header, JSON chunk, BIN chunk). It is small, but merging buffers, re-pointing images into buffer views and 4-byte alignment are easy to get subtly wrong, and the worker would still need the library.

**Two commands with a local cache in between: `fetch` and `import`.**

- `ingest fetch` lists models, picks the glTF files at the requested resolution and streams each file to `<cache>/<model id>/<resolution>/`, computing MD5 while writing. A file whose size and MD5 already match is skipped, so an interrupted fetch resumes where it stopped. Downloads have a small fixed limit on parallel requests, because the API belongs to someone else.
- `ingest import` reads the cache and runs a pipeline: pack (CPU) → upload (network: `InitiateUpload`, parts PUT to presigned URLs, `CompleteUpload`). Stages are connected by bounded queues, so a slow stage blocks the one before it instead of letting buffered models pile up in memory. A state file in the cache records each imported model's asset id, so a re-run skips finished models.

Benchmarks measure `import` only: it reads local files, so results don't depend on Poly Haven's servers, and repeated runs don't re-download anything. Considered: one command that streams from the API straight into the upload. Fewer moving parts, but every benchmark run would hit the API and include its latency.

**Shape: a NestJS application context, no CLI framework.**
`ingest` follows the same conventions as the other Node apps (config validated at startup, pino logs, ports and adapters). `main.ts` parses the command line with `node:util` `parseArgs` and runs one command in `NestFactory.createApplicationContext`, without an HTTP or gRPC server. It talks to asset-service over gRPC directly, like the processing worker: both are internal clients, and file bytes go to object storage over presigned URLs, as from the browser.

## Consequences

- Imported assets get Poly Haven's names, tags and categories plus the `polyhaven` tag; the web asset page shows the credit for assets with that tag.
- Imports are not deduplicated by asset-service: the state file in the cache is what keeps a re-run from creating duplicates. A fresh cache directory imports everything again, which the DB-loading benchmark uses on purpose.
- Poly Haven has hundreds of models, not thousands. Benchmarks that need more rows import the same cache several times.
- If the API changes its endpoints or terms, only the Poly Haven client in `ingest` changes; `import` works on the cache alone.
