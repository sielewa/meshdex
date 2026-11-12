# Ingest import: packing on the main thread vs in worker threads

- **Date:** 2026-11-12
- **Code:** `1c22834` (clean tree in every run)
- **Question:** does moving glTF → GLB packing off the main thread (`--pack-in-workers`) make `ingest import` faster, and what does it cost?
- **Answer:** no. In both subsets the import is limited by uploads, so freeing the main thread doesn't add throughput. Workers make every run about 0.2 s slower (thread start-up), use about 60–115 % more CPU and about 140 MB more memory. They only cut event-loop delay (max 22.9 → 5.3 ms on the 1k subset). **Main-thread packing stays the default**; `--pack-in-workers` stays as an option.

## What is measured

`ingest import` reads models from the local cache, packs each glTF (`.gltf` + `.bin` + textures) into one GLB in memory and uploads it to asset-service (presigned multipart upload to object storage). The two stages run as a pipeline: P packers → bounded queue of Q GLBs → U uploaders ([data-processing.md](../data-processing.md), "Two-stage pipeline with a bounded queue").

The two configurations differ only in where packing runs:

| Configuration | Flag                | Packing runs on                                                                    |
| ------------- | ------------------- | ---------------------------------------------------------------------------------- |
| `main`        | none                | the main thread, with the event loop that also drives the uploads                  |
| `workers`     | `--pack-in-workers` | one worker thread per pack slot; the GLB comes back as a transferred `ArrayBuffer` |

Everything else is the same: P = 2, Q = 4, U = 4 (defaults).

Each run is recorded by `RunProbe` from the start of the command to its end, so worker start-up and shutdown count against `workers`. Metrics (all in the run files):

- `wallMs`, CPU time (`cpuUserMs + cpuSystemMs`, the whole process, all threads);
- peak RSS in SI megabytes, like throughput (the whole process; `peakArrayBuffersBytes` counts the main thread only, so it isn't comparable between the modes);
- event-loop delay of the main thread (p99, max), sampled with `monitorEventLoopDelay`;
- pipeline time summed over slots: packing, uploading, packers blocked on a full queue, uploaders idle on an empty one. Blocked packers mean uploads are the bottleneck; idle uploaders mean packing is.

## Method

- **Subsets:** `1k50` = the first 50 cached models by id at 1k textures (65.2 MB of GLB, 1.3 MB per model on average); `4k10` = the first 10 at 4k textures (80.7 MB, 8.1 MB per model).
- **Order:** per subset, one warm-up run of each mode (not recorded here), then 5 pairs in ABBA order (pair 1 `main` → `workers`, pair 2 `workers` → `main`, ...), so slow drift (rows and objects accumulating in Postgres and SeaweedFS, thermal state) doesn't favour one mode.
- **Fresh state:** every run gets its own empty state file (`--state`), so it imports the whole subset; each run creates new assets.
- **Correctness:** all 20 runs imported every selected model with no failures and uploaded the same byte count per subset. Earlier checks read the stored bytes back and found them identical between the two modes.
- **Statistics:** median and min–max of 5 runs. Where the two modes' ranges don't overlap at all, a Mann–Whitney test on 5 vs 5 runs gives p ≈ 0.008 (two-sided), so such differences aren't noise.
- **Pause:** 2 s between runs.

## Environment

Everything on one machine (local development, not the production-like environment):

- Apple M4 (10 cores), 32 GB RAM, macOS 26.5.2, Node.js v24.22.1.
- asset-service (Node, `dist/`) on the host; Postgres (`pgvector/pgvector:0.8.7-pg18-trixie`), SeaweedFS 4.51 (S3) and Redpanda v26.2.6 in Docker Desktop 27.4.0.
- Uploads go over loopback: no network latency, but object storage, asset-service and ingest share the same CPU cores.
- The model cache was in the OS page cache after the warm-up runs, so file reads are memory reads. This is intended: the question is about CPU work on the main thread, not disk.

## Results

Median (min–max) of 5 runs.

| Metric                | 1k50 `main`          | 1k50 `workers`       | 4k10 `main`          | 4k10 `workers`        |
| --------------------- | -------------------- | -------------------- | -------------------- | --------------------- |
| Wall time             | **786** (762–811) ms | 965 (871–997) ms     | **601** (578–609) ms | 798 (768–818) ms      |
| Throughput            | **83.0** MB/s        | 67.6 MB/s            | **134** MB/s         | 101 MB/s              |
| CPU time              | **879** ms           | 1406 ms (+60 %)      | **427** ms           | 924 ms (+116 %)       |
| Peak RSS              | **382** MB           | 518 MB               | **509** MB           | 653 MB                |
| Event-loop delay p99  | 5.8 ms               | **2.2** ms           | 4.7 ms               | **3.0** ms            |
| Event-loop delay max  | 22.9 (19.0–25.6) ms  | **5.3** (4.6–8.3) ms | 11.8 (10.1–25.3) ms  | **9.7** (8.3–10.7) ms |
| Pack busy (2 slots)   | 294 ms               | 529 ms               | 197 ms               | 404 ms                |
| Upload busy (4 slots) | 2914 ms              | 3046 ms              | 2098 ms              | 2327 ms               |
| Packers blocked       | 902 ms               | 1001 ms              | 253 ms               | 371 ms                |
| Uploaders idle        | 50 ms                | 623 ms               | 98 ms                | 651 ms                |

Wall time, CPU time, RSS and event-loop delay p99 don't overlap between the modes in either subset.

## Conclusions

1. **Uploads are the bottleneck, so packing elsewhere can't speed the import up.** With main-thread packing the 4 uploaders are busy 93 % (1k50) and 87 % (4k10) of the run, while the packers spend only 16–19 % of their time packing and 57 % (1k50) of it blocked on a full queue. Making the faster stage faster doesn't move the pipeline.
2. **Workers cost about 0.2 s per run, almost all of it at the start.** The wall-time gap is 179 ms (1k50) and 197 ms (4k10) and doesn't grow with the number of models. Uploaders wait about 155 ms each for the first packed model in `workers` mode (idle 623 vs 50 ms over 4 slots) instead of about 12 ms: that is the time to start the threads and load the packing code into each of them. On a long import this fixed cost would be amortised; on these short runs it decides the result.
3. **Every worker is a whole V8 isolate.** CPU time grows by about 500 ms in both subsets (two isolates starting and loading `@gltf-transform`, plus structured cloning of requests and manifests) and RSS by about 140 MB (about 70 MB per worker). "Pack busy" doubles because, seen from the main thread, it now includes the round trip to the worker.
4. **The one gain is a calmer event loop.** Main-thread packing blocks the loop for at most 19–26 ms on 1k models; workers bring that down to 5–8 ms. For a batch CLI whose gRPC deadlines are 2 s and 15 s this doesn't matter. It would matter if the same process had to answer latency-sensitive requests, or if packing grew CPU-heavy (mesh compression, texture resizing) or handled much bigger models (the 1k catalog has a 958 MB one), where a single pack could block the loop for seconds.
5. **Per-model overhead shows up as soon as models get small.** The same pipeline moves 134 MB/s with 8 MB models and 83 MB/s with 1.3 MB ones: about 58 ms of upload time per 1k model against 210 ms per 4k model that is six times bigger. Each model costs several round trips to asset-service (initiate, part URLs, part upload, complete) whatever its size. Upload concurrency and the per-model control path are where the next gain is, not packing.

## Limitations

- Short runs (0.6–1 s), so fixed costs weigh heavily. A comparison of steady-state throughput needs longer imports, which local disk space doesn't allow now (every run stores a full copy of the subset).
- Single machine, loopback storage: real network latency would make uploads slower still, which would strengthen conclusion 1.
- 5 runs per configuration: enough to separate these differences, too few for reliable tail percentiles across runs.
- Not the production-like environment: the roadmap's Stage 4 numbers come from Kubernetes with resource limits.

## Next

- ~~Sweep upload concurrency U~~: done, [ingest-upload-concurrency.md](ingest-upload-concurrency.md). A sweep of queue size Q is still open.
- A byte budget for the pipeline before importing models of hundreds of MB.
- Repeat the measurement inside kind with CPU and memory limits (Stage 4).

## Reproducing

From a clean working tree, with infrastructure and asset-service running and the models in the ingest cache (`ingest fetch --limit 50` at 1k and `--resolution 4k --limit 10`), after `pnpm --filter @meshdex/ingest build`, each run is:

```
node apps/ingest/dist/main.js import --resolution 1k --limit 50 [--pack-in-workers] \
  --state <new empty state file> --record docs/benchmarks/runs --label 1k50-<main|workers>
node apps/ingest/dist/main.js import --resolution 4k --limit 10 [--pack-in-workers] \
  --state <new empty state file> --record docs/benchmarks/runs --label 4k10-<main|workers>
```

repeated in the order described under Method (one warm-up per mode, recorded elsewhere; then 5 pairs in ABBA order), with `LOG_LEVEL=warn`.

## Runs

| Configuration  | Files (`runs/`)                                                                                                                                                                                                                                                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1k50 `main`    | [20-38-01](runs/2026-11-12T20-38-01-239Z-import-1k50-main.json), [20-38-10](runs/2026-11-12T20-38-10-828Z-import-1k50-main.json), [20-38-13](runs/2026-11-12T20-38-13-928Z-import-1k50-main.json), [20-38-23](runs/2026-11-12T20-38-23-426Z-import-1k50-main.json), [20-38-26](runs/2026-11-12T20-38-26-529Z-import-1k50-main.json)                |
| 1k50 `workers` | [20-38-04](runs/2026-11-12T20-38-04-275Z-import-1k50-workers.json), [20-38-07](runs/2026-11-12T20-38-07-525Z-import-1k50-workers.json), [20-38-17](runs/2026-11-12T20-38-17-018Z-import-1k50-workers.json), [20-38-20](runs/2026-11-12T20-38-20-277Z-import-1k50-workers.json), [20-38-29](runs/2026-11-12T20-38-29-595Z-import-1k50-workers.json) |
| 4k10 `main`    | [20-38-38](runs/2026-11-12T20-38-38-887Z-import-4k10-main.json), [20-38-47](runs/2026-11-12T20-38-47-937Z-import-4k10-main.json), [20-38-50](runs/2026-11-12T20-38-50-827Z-import-4k10-main.json), [20-39-00](runs/2026-11-12T20-39-00-020Z-import-4k10-main.json), [20-39-02](runs/2026-11-12T20-39-02-925Z-import-4k10-main.json)                |
| 4k10 `workers` | [20-38-41](runs/2026-11-12T20-38-41-753Z-import-4k10-workers.json), [20-38-44](runs/2026-11-12T20-38-44-816Z-import-4k10-workers.json), [20-38-53](runs/2026-11-12T20-38-53-806Z-import-4k10-workers.json), [20-38-56](runs/2026-11-12T20-38-56-892Z-import-4k10-workers.json), [20-39-05](runs/2026-11-12T20-39-05-816Z-import-4k10-workers.json) |
