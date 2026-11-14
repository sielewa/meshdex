# Reindex: batch size, loader workers and prefetch depth

- **Date:** 2026-11-13
- **Code:** `d328d9e` (clean tree in every run)
- **Questions:** how many images per model call (batch size B), how many DataLoader worker processes (W) and how many ready batches per worker (prefetch factor F) does the reindex job need, which part of it is the bottleneck, and what does each setting cost?
- **Answers:**
  - **The job is model-bound from W = 2 on.** The model needs 3.9 ms per image (about 260 images/s on this machine). Two workers load faster than that, so the main process waits for images only 25 ms of a 4.2 s run, and steady throughput reaches 245 images/s, 94 % of the model's limit.
  - **Batch size:** steady throughput rises from 166 to 246 images/s between B = 8 and B = 256. Model time stops improving at B = 64; above that the gain comes from fewer, larger database writes, which sit on the same critical path as the model. Start-up grows with B, because one worker loads the whole first batch. On 517 images the total time is therefore lowest around B = 32–64. **The default stays at B = 64.**
  - **Workers:** W = 0 (loading in the main process) halves throughput (104 images/s). W = 1 almost keeps up and W = 2 is fastest (4.24 s). Each further worker adds start-up, shutdown and about 3 s of CPU. **The default stays at W = 4** until the sweep is repeated against object storage over a network (see Conclusions).
  - **Prefetch:** no measurable effect, because loading is already faster than the model. **The default stays at F = 2.**

## Why this experiment

The reindex job ([ADR 018](../adr/018-ml-service-tooling-data-access-and-reindex-job.md), [data-processing.md](../data-processing.md), "Parallel image loading") embeds every source preview with CLIP. Worker processes fetch images from object storage, decode them and resize them while the main process runs the model on the previous batch, then writes the batch's vectors with one binary `COPY`. Three knobs decide whether that overlap works: B (work per model call and per write), W (loading parallelism) and F (how far loading may run ahead). The defaults (64, 4, 2) were chosen before any measurement. This sweep checks them and, more importantly, finds which side of the pipeline limits it.

## What is measured

`python -m ml_service reindex --all`: re-embed all 517 source previews of the catalogue (518 versions listed, 1 without an image) with `ViT-B-32/laion2b_s34b_b79k` on the GPU (`mps`). With `--all`, every run does the same work regardless of what earlier runs stored. Each run is recorded with `--record` ([ADR 014](../adr/014-benchmark-runs-as-json-in-the-repo.md)): options, machine, commit, process measurements and per-stage timings.

Main-process stages, which add up to (almost) the wall time:

| Stage           | Meaning                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------- |
| list            | Listing the catalogue over gRPC and dropping versions without an image                            |
| start-up        | Until the first batch arrives: worker processes spawned, imports done, one whole batch loaded     |
| loader wait     | Waiting for every later batch. Long means loading cannot keep up with the model                   |
| model           | Moving the batch to the GPU and running the image encoder                                         |
| database writes | One transaction per batch: delete the assets' previous rows, then `COPY` the new vectors (binary) |
| shutdown        | The last call for a batch, which finds the loader exhausted and stops the workers                 |

"Steady throughput" counts images embedded between the end of the first batch and the start of the shutdown. It is the rate a much larger catalogue would see, with start-up and shutdown paid once. Worker stages (fetch, decode, preprocess) are sums over all images and overlap with the main process. CPU time covers the main process and its workers, model loading included. Wall time excludes model loading.

Three sweeps, each varying one setting around a fixed point:

| Experiment | Varies                      | Fixed         |
| ---------- | --------------------------- | ------------- |
| batch      | B = 8, 16, 32, 64, 128, 256 | W = 4, F = 2  |
| workers    | W = 0, 1, 2, 4, 8           | B = 64, F = 2 |
| prefetch   | F = 1, 2, 4                 | B = 64, W = 2 |

## Method

- 14 configurations. One unrecorded warm-up run each (page cache, Postgres buffers, model file), then 5 rounds.
- Each round runs every configuration once, in an order rotated per round and reversed on odd rounds, so slow drift (heat, background load) doesn't favour one configuration. This is the scheme of the ingest sweeps, driven by [`apps/ml-service/scripts/reindex_sweep.py`](../../apps/ml-service/scripts/reindex_sweep.py). The script was moved into the repository after recording, with the same configurations, order and commands.
- All 70 runs embedded all 517 images with no failures.
- Median and min–max of 5 runs; the ranges show where two configurations overlap.

**Same configuration, two experiments.** B = 64, W = 4, F = 2 was run as part of the batch sweep and again as part of the workers sweep, interleaved in the same rounds. The medians differ: wall time 4778 vs 4579 ms (4 %), steady throughput 222 vs 239 images/s (8 %), database writes 403 vs 228 ms. Differences of that size between configurations are not evidence on their own. Database writes vary most; each run deletes and re-inserts all 517 vectors, so the result depends on how far autovacuum got with the previous run's dead rows and on HNSW index maintenance (a likely cause, not verified). Conclusions below rest on trends across a whole sweep, not on single neighbouring pairs.

## Environment

Apple M4 (10 cores), 32 GB RAM, macOS 26.5.2; Python 3.12.16, PyTorch 2.15.0, GPU through `mps`. ml-service and asset-service run on the host; Postgres (pgvector) and SeaweedFS run in Docker Desktop. Images are fetched over loopback (about 2 ms per image), and storage, database and job share the same CPU cores. Workers start with `spawn`, so each one is a fresh Python process that imports torch.

## Results

### Batch size (W = 4, F = 2)

Median (min–max) of 5 runs.

| Metric                    | B = 8                | B = 16           | B = 32               | B = 64           | B = 128          | B = 256           |
| ------------------------- | -------------------- | ---------------- | -------------------- | ---------------- | ---------------- | ----------------- |
| Wall time (ms)            | 5292 (5230–5998)     | 4806 (4581–4893) | **4620** (4440–4754) | 4778 (4528–4902) | 4915 (4792–5099) | 5273 (5140–5443)  |
| Steady throughput (img/s) | 166 (161–171)        | 199 (194–216)    | 219 (209–236)        | 222 (214–244)    | 232 (221–248)    | **246** (222–257) |
| Start-up (ms)             | **1463** (1370–1797) | 1450 (1432–1455) | 1512 (1476–1546)     | 1683 (1616–1709) | 1943 (1907–2009) | 2446 (2393–2462)  |
| Model (ms)                | 2440                 | 2173             | 2031                 | 2020             | 2000             | **1965**          |
| Database writes (ms)      | 769                  | 528              | 436                  | 403              | 326              | **157**           |
| Batches                   | 65                   | 33               | 17                   | 9                | 5                | 3                 |
| Peak RSS of one worker    | 417 MB               | 421 MB           | 426 MB               | 454 MB           | 494 MB           | 577 MB            |

Loader wait stays between 16 and 32 ms in every column, and shutdown at 0.53–0.56 s. CPU time is 11.6–12.1 s throughout.

### Loader workers (B = 64, F = 2)

| Metric                    | W = 0            | W = 1                | W = 2                | W = 4            | W = 8            |
| ------------------------- | ---------------- | -------------------- | -------------------- | ---------------- | ---------------- |
| Wall time (ms)            | 5121 (5041–5160) | **4234** (4134–4660) | **4240** (4204–4434) | 4579 (4539–5026) | 6191 (5904–6316) |
| Steady throughput (img/s) | 104 (103–107)    | 230 (206–234)        | **245** (240–250)    | 239 (237–240)    | 235 (235–239)    |
| Loader wait (ms)          | 2468             | 137                  | **25**               | 30               | 40               |
| Start-up (ms)             | **391**          | 1493                 | 1524                 | 1684             | 2515             |
| Shutdown (ms)             | **0**            | 332                  | 402                  | 530              | 838              |
| Model (ms)                | 1998             | 1999                 | 1990                 | 2034             | 2313             |
| CPU time (s)              | **4.3**          | 5.4                  | 7.2                  | 12.0             | 27.8             |

### Prefetch factor (B = 64, W = 2)

| Metric                    | F = 1            | F = 2            | F = 4            |
| ------------------------- | ---------------- | ---------------- | ---------------- |
| Wall time (ms)            | 4249 (4188–4364) | 4319 (4273–4540) | 4317 (4234–4585) |
| Steady throughput (img/s) | 244 (241–246)    | 240 (219–247)    | 238 (217–246)    |
| Loader wait (ms)          | 22               | 23               | 28               |

All three ranges overlap in every metric.

## Conclusions

1. **The model is the bottleneck once loading is parallel.** The model takes about 2.0 s for 517 images (3.9 ms per image, about 260 images/s). From W = 2 on, the main process waits for images only 25–40 ms per run, and steady throughput (235–245 images/s) sits just under that limit. The missing few percent are the database writes, which run between model calls on the same thread. Faster loading cannot make this job faster. A faster model step can (half precision, a smaller image size, a compiled model), and so can taking the writes off the model's path (see 7).

2. **Without workers, loading and the model take turns.** At W = 0 each image costs its loading (fetch 2.8 + decode 1.5 + preprocess 1.2 = 5.5 ms) plus model and write (4.3 ms) in sequence: about 9.8 ms, or 102 images/s, against 104 measured. The 2.5 s of loader wait is exactly the loading that workers would have overlapped. W = 0 still has the shortest start-up (0.39 s) and no shutdown, because nothing is spawned.

3. **One worker almost keeps up, two are enough.** One worker needs about 4.7 ms per image; the main process needs 4.2 ms (model plus writes). Loading is the slower side by about 10 %, which shows up as 137 ms of loader wait and 230 instead of 245 images/s. Two workers supply roughly 2 / 4.7 ms ≈ 425 images/s, far more than the model consumes. W = 1 and W = 2 have the same median wall time (4.23 vs 4.24 s), but W = 1 is less stable (range 4.13–4.66 s).

4. **Every extra worker is a fixed cost.** A spawned worker is a new Python process that imports torch: about 450 MB of resident memory and about 3 s of CPU each (CPU time 7.2 → 12.0 → 27.8 s for W = 2 → 4 → 8). Start-up grows from 1.5 to 2.5 s and shutdown from 0.4 to 0.8 s. At W = 8, nine busy processes share ten cores with storage and the database, and even the model step slows down by 16 % (2.31 vs 1.99 s). On a pod with a CPU limit this cost would show up as throttling.

5. **Small batches waste the model and the database; large batches delay the start.** From B = 8 to B = 64, model time falls by 17 % (fewer, fuller GPU calls); beyond 64 it is flat. Database writes keep falling all the way (769 → 157 ms for 65 → 3 transactions), and since they run on the model's thread, steady throughput follows them. Model plus writes per image predicts it well: 6.2 ms → 161 images/s at B = 8 (166 measured), 4.1 ms → 244 images/s at B = 256 (246 measured). Against that, start-up grows by about 4 ms per image of batch size (1.46 s → 2.45 s from B = 8 to B = 256). A DataLoader worker produces whole batches, so the first batch is loaded by one worker alone, image by image. Worker memory grows too (417 → 577 MB per worker).

6. **At this catalogue size, fixed costs are half of the run.** For B = 64, W = 2: list 0.05 s, start-up 1.52 s and shutdown 0.40 s make up 47 % of 4.24 s. Total throughput is therefore 122 images/s, half the steady rate. This is why total time is lowest at moderate batch sizes here (B = 32: 4.62 s, B = 64: 4.78 s, ranges overlapping), while a catalogue of tens of thousands of images would favour B = 128–256. An incremental reindex of a few new images is all start-up, whatever B is.

7. **Defaults, and why they stay for now.**
   - **B = 64:** the model gains nothing beyond it. The remaining gain from larger batches is in database writes, the most variable measurement here, and it costs start-up and worker memory. A better fix than a larger batch is to write batch _n_ while the model runs batch _n + 1_ (a writer thread, or a second connection), which removes the writes from the critical path at any batch size. That is the next optimisation to measure.
   - **W = 4:** locally, 2 is fastest and 4 costs 0.34 s and 4.8 s of CPU more. But here a fetch takes about 2 ms over loopback. Against object storage over a network a fetch waits tens of milliseconds, and by Little's law a worker that is mostly waiting delivers proportionally fewer images per second, so more workers are needed to keep the model busy. The default is chosen when the sweep is repeated in the cluster (Stage 4), as with ingest's upload concurrency ([ingest-upload-concurrency.md](ingest-upload-concurrency.md)).
   - **F = 2:** PyTorch's default. Prefetch depth only matters when loading is slower than the model or uneven. With W = 2 the queue is never empty, so F changes nothing. It is worth re-checking with network storage, where single fetches can stall.

## Limitations

- Short runs (4–6 s) on a small catalogue (517 images), where fixed costs dominate the totals; steady throughput at B = 256 comes from only 2 batches.
- One machine; storage on loopback; GPU through `mps`, not CUDA. Absolute numbers will differ on a cluster node; the method (stage timings, loader wait as the bottleneck signal) carries over.
- Database writes vary between identical configurations by up to 1.8 times (see Method). Their trend across batch sizes is consistent, their absolute values are not.
- One setting at a time around a fixed point: interactions (e.g. a large B with W = 2) are not measured.

## Reproducing

From a clean working tree, with the stack, asset-service and a catalogue of source previews in place (`ingest import`), from `apps/ml-service`:

```
uv run python scripts/reindex_sweep.py 5 ../../docs/benchmarks/runs
```

Each run it starts is:

```
python -m ml_service reindex --all --batch-size <B> --num-workers <W> --prefetch-factor <F> \
  --record ../../docs/benchmarks/runs --label <experiment>-b<B>-w<W>-p<F>
```

Nothing in the working tree may change while runs are recorded: every record states whether the tree was clean.

## Runs

| Label                | Files (`runs/`)                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `batch-b8-w4-p2`     | [15-53-11](runs/2026-11-13T15-53-11-534Z-reindex-batch-b8-w4-p2.json), [15-55-25](runs/2026-11-13T15-55-25-169Z-reindex-batch-b8-w4-p2.json), [15-57-09](runs/2026-11-13T15-57-09-858Z-reindex-batch-b8-w4-p2.json), [15-58-23](runs/2026-11-13T15-58-23-832Z-reindex-batch-b8-w4-p2.json), [16-01-04](runs/2026-11-13T16-01-04-581Z-reindex-batch-b8-w4-p2.json)                     |
| `batch-b16-w4-p2`    | [15-53-19](runs/2026-11-13T15-53-19-360Z-reindex-batch-b16-w4-p2.json), [15-55-18](runs/2026-11-13T15-55-18-002Z-reindex-batch-b16-w4-p2.json), [15-57-17](runs/2026-11-13T15-57-17-748Z-reindex-batch-b16-w4-p2.json), [15-59-59](runs/2026-11-13T15-59-59-285Z-reindex-batch-b16-w4-p2.json), [16-01-12](runs/2026-11-13T16-01-12-589Z-reindex-batch-b16-w4-p2.json)                |
| `batch-b32-w4-p2`    | [15-53-26](runs/2026-11-13T15-53-26-833Z-reindex-batch-b32-w4-p2.json), [15-55-10](runs/2026-11-13T15-55-10-978Z-reindex-batch-b32-w4-p2.json), [15-57-25](runs/2026-11-13T15-57-25-230Z-reindex-batch-b32-w4-p2.json), [15-59-52](runs/2026-11-13T15-59-52-236Z-reindex-batch-b32-w4-p2.json), [16-01-20](runs/2026-11-13T16-01-20-025Z-reindex-batch-b32-w4-p2.json)                |
| `batch-b64-w4-p2`    | [15-53-34](runs/2026-11-13T15-53-34-020Z-reindex-batch-b64-w4-p2.json), [15-55-03](runs/2026-11-13T15-55-03-889Z-reindex-batch-b64-w4-p2.json), [15-57-32](runs/2026-11-13T15-57-32-481Z-reindex-batch-b64-w4-p2.json), [15-59-45](runs/2026-11-13T15-59-45-028Z-reindex-batch-b64-w4-p2.json), [16-01-27](runs/2026-11-13T16-01-27-409Z-reindex-batch-b64-w4-p2.json)                |
| `batch-b128-w4-p2`   | [15-53-41](runs/2026-11-13T15-53-41-360Z-reindex-batch-b128-w4-p2.json), [15-54-56](runs/2026-11-13T15-54-56-388Z-reindex-batch-b128-w4-p2.json), [15-57-39](runs/2026-11-13T15-57-39-874Z-reindex-batch-b128-w4-p2.json), [15-59-37](runs/2026-11-13T15-59-37-690Z-reindex-batch-b128-w4-p2.json), [16-01-34](runs/2026-11-13T16-01-34-888Z-reindex-batch-b128-w4-p2.json)           |
| `batch-b256-w4-p2`   | [15-53-48](runs/2026-11-13T15-53-48-834Z-reindex-batch-b256-w4-p2.json), [15-56-32](runs/2026-11-13T15-56-32-951Z-reindex-batch-b256-w4-p2.json), [15-57-47](runs/2026-11-13T15-57-47-437Z-reindex-batch-b256-w4-p2.json), [15-59-29](runs/2026-11-13T15-59-29-829Z-reindex-batch-b256-w4-p2.json), [16-01-42](runs/2026-11-13T16-01-42-590Z-reindex-batch-b256-w4-p2.json)           |
| `workers-b64-w0-p2`  | [15-53-56](runs/2026-11-13T15-53-56-599Z-reindex-workers-b64-w0-p2.json), [15-56-25](runs/2026-11-13T15-56-25-205Z-reindex-workers-b64-w0-p2.json), [15-57-55](runs/2026-11-13T15-57-55-285Z-reindex-workers-b64-w0-p2.json), [15-59-22](runs/2026-11-13T15-59-22-182Z-reindex-workers-b64-w0-p2.json), [16-00-06](runs/2026-11-13T16-00-06-512Z-reindex-workers-b64-w0-p2.json)      |
| `workers-b64-w1-p2`  | [15-54-04](runs/2026-11-13T15-54-04-366Z-reindex-workers-b64-w1-p2.json), [15-56-18](runs/2026-11-13T15-56-18-387Z-reindex-workers-b64-w1-p2.json), [15-58-03](runs/2026-11-13T15-58-03-096Z-reindex-workers-b64-w1-p2.json), [15-59-15](runs/2026-11-13T15-59-15-479Z-reindex-workers-b64-w1-p2.json), [16-00-14](runs/2026-11-13T16-00-14-272Z-reindex-workers-b64-w1-p2.json)      |
| `workers-b64-w2-p2`  | [15-54-11](runs/2026-11-13T15-54-11-776Z-reindex-workers-b64-w2-p2.json), [15-56-11](runs/2026-11-13T15-56-11-555Z-reindex-workers-b64-w2-p2.json), [15-58-09](runs/2026-11-13T15-58-09-883Z-reindex-workers-b64-w2-p2.json), [15-59-08](runs/2026-11-13T15-59-08-650Z-reindex-workers-b64-w2-p2.json), [16-00-21](runs/2026-11-13T16-00-21-170Z-reindex-workers-b64-w2-p2.json)      |
| `workers-b64-w4-p2`  | [15-54-18](runs/2026-11-13T15-54-18-965Z-reindex-workers-b64-w4-p2.json), [15-56-04](runs/2026-11-13T15-56-04-216Z-reindex-workers-b64-w4-p2.json), [15-58-16](runs/2026-11-13T15-58-16-711Z-reindex-workers-b64-w4-p2.json), [15-59-01](runs/2026-11-13T15-59-01-480Z-reindex-workers-b64-w4-p2.json), [16-00-28](runs/2026-11-13T16-00-28-028Z-reindex-workers-b64-w4-p2.json)      |
| `workers-b64-w8-p2`  | [15-54-26](runs/2026-11-13T15-54-26-692Z-reindex-workers-b64-w8-p2.json), [15-55-55](runs/2026-11-13T15-55-55-195Z-reindex-workers-b64-w8-p2.json), [15-56-40](runs/2026-11-13T15-56-40-812Z-reindex-workers-b64-w8-p2.json), [15-58-52](runs/2026-11-13T15-58-52-677Z-reindex-workers-b64-w8-p2.json), [16-00-35](runs/2026-11-13T16-00-35-181Z-reindex-workers-b64-w8-p2.json)      |
| `prefetch-b64-w2-p1` | [15-54-35](runs/2026-11-13T15-54-35-546Z-reindex-prefetch-b64-w2-p1.json), [15-55-48](runs/2026-11-13T15-55-48-369Z-reindex-prefetch-b64-w2-p1.json), [15-56-49](runs/2026-11-13T15-56-49-333Z-reindex-prefetch-b64-w2-p1.json), [15-58-45](runs/2026-11-13T15-58-45-871Z-reindex-prefetch-b64-w2-p1.json), [16-00-43](runs/2026-11-13T16-00-43-902Z-reindex-prefetch-b64-w2-p1.json) |
| `prefetch-b64-w2-p2` | [15-54-42](runs/2026-11-13T15-54-42-529Z-reindex-prefetch-b64-w2-p2.json), [15-55-41](runs/2026-11-13T15-55-41-245Z-reindex-prefetch-b64-w2-p2.json), [15-56-56](runs/2026-11-13T15-56-56-095Z-reindex-prefetch-b64-w2-p2.json), [15-58-38](runs/2026-11-13T15-58-38-749Z-reindex-prefetch-b64-w2-p2.json), [16-00-50](runs/2026-11-13T16-00-50-750Z-reindex-prefetch-b64-w2-p2.json) |
| `prefetch-b64-w2-p4` | [15-54-49](runs/2026-11-13T15-54-49-419Z-reindex-prefetch-b64-w2-p4.json), [15-55-34](runs/2026-11-13T15-55-34-009Z-reindex-prefetch-b64-w2-p4.json), [15-57-02](runs/2026-11-13T15-57-02-976Z-reindex-prefetch-b64-w2-p4.json), [15-58-31](runs/2026-11-13T15-58-31-614Z-reindex-prefetch-b64-w2-p4.json), [16-00-57](runs/2026-11-13T16-00-57-722Z-reindex-prefetch-b64-w2-p4.json) |
