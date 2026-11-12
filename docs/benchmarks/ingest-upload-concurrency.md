# Ingest import: upload concurrency

- **Date:** 2026-11-12
- **Code:** `57c5cac` (clean tree in every run)
- **Question:** how does import throughput grow with the number of models uploaded in parallel (U), and where does it stop paying off?
- **Answer:** with diminishing returns. Going from 1 to 8 uploaders takes the import from 40 to 88 MB/s (2.2 times faster for 8 times the concurrency); each doubling helps less (1.49, 1.27, 1.17 times) because every single upload gets slower as more run at once. The cost is small: about 30 MB more memory and a busier event loop (p99 3.6 → 7.7 ms). **The default stays at U = 4** until the sweep is repeated against storage over a network, where the answer is expected to change (see Conclusions).

## Why this experiment

The [packing experiment](ingest-import.md) showed the import is limited by uploads: with U = 4 the uploaders were busy almost the whole run while packers waited on a full queue. The natural next question is how far more parallel uploads move that limit.

## What is measured

Same command, data and metrics as the packing experiment ([ingest-import.md](ingest-import.md), "What is measured"): `ingest import` of the first 50 cached models at 1k textures (65.2 MB of GLB), packing on the main thread, P = 2 packers, Q = 4 queue slots. Only U varies: 1, 2, 4, 8 (the CLI allows up to 16). Each uploader sends one model at a time: initiate the upload at asset-service, get presigned part URLs, PUT the parts to object storage, complete the upload.

## Method

- One unrecorded warm-up run per value of U, then 5 rounds. Each round runs every value once, in an order rotated per round and reversed on odd rounds (`1 2 4 8`, `1 8 4 2`, `4 8 1 2`, `4 2 1 8`, `1 2 4 8`), so slow drift doesn't favour one value.
- Fresh state file per run (every run imports all 50 models); 2 s pause between runs.
- All 20 runs imported every model with no failures and the same byte count.
- Median and min–max of 5 runs, as in the packing experiment.

**Compare only within one session.** U = 4 here is exactly the configuration of the packing experiment's `1k50-main` runs (also U = 4), measured the day before in another session: median 786 ms there, 865 ms here. A first attempt at this sweep, discarded because the working tree changed during it, measured 948 ms. Between sessions the state of the stack differs (rows and objects accumulated in Postgres and SeaweedFS, a restarted asset-service, background load), and that moves results by 10–20 %, more than many effects worth measuring. Interleaved runs within one session are what make the comparison fair; numbers from different sessions are not compared.

## Environment

The same machine and local stack as the packing experiment ([ingest-import.md](ingest-import.md), "Environment"): Apple M4 (10 cores), 32 GB RAM, macOS 26.5.2, Node.js v24.22.1; asset-service on the host; Postgres, SeaweedFS and Redpanda in Docker Desktop. Uploads go over loopback, and object storage, asset-service and ingest share the same CPU cores.

## Results

Median (min–max) of 5 runs.

| Metric                           | U = 1               | U = 2               | U = 4            | U = 8                |
| -------------------------------- | ------------------- | ------------------- | ---------------- | -------------------- |
| Wall time                        | 1631 (1533–1711) ms | 1097 (1027–1172) ms | 865 (772–948) ms | **742** (702–834) ms |
| Throughput                       | 40.0 MB/s           | 59.4 MB/s           | 75.4 MB/s        | **87.9** MB/s        |
| Speed-up over the previous U     | –                   | 1.49×               | 1.27×            | 1.17×                |
| Upload time per model            | 32 ms               | 42 ms               | 65 ms            | 103 ms               |
| Uploaders busy (share of slots)  | 98 %                | 96 %                | 94 %             | 86 %                 |
| Packers blocked (share of slots) | 74 %                | 70 %                | 59 %             | 45 %                 |
| CPU time (ingest process)        | 1118 ms             | 971 ms              | 912 ms           | 800 ms               |
| Peak RSS                         | 352 MB              | 355 MB              | 377 MB           | 384 MB               |
| Event-loop delay p99             | 3.6 ms              | 4.4 ms              | 6.3 ms           | 7.7 ms               |
| Event-loop delay max             | 27.9 ms             | 21.1 ms             | 24.1 ms          | 24.1 ms              |

"Upload time per model" is upload busy time divided by 50 models; "share of slots" is busy (or blocked) time divided by the number of slots times wall time. Wall time doesn't overlap between any two neighbouring values of U except U = 4 and U = 8 (772–948 vs 702–834 ms), whose medians still differ by 14 %.

## Conclusions

1. **Throughput grows, but each doubling buys less.** 1 → 2 uploaders: 1.49×, 2 → 4: 1.27×, 4 → 8: 1.17×. Eight times the concurrency gives 2.2 times the throughput.
2. **The reason is that each upload slows down as more run at once.** One upload takes 32 ms on its own and 103 ms when eight run together. With everything on one machine, the uploads compete for the same CPU in asset-service, SeaweedFS and Postgres (each model costs several gRPC calls and database writes besides the bytes). Little's law gives the ceiling: models per second ≈ uploads in flight ÷ time per upload. U = 1: 1 ÷ 32 ms ≈ 31 models/s (measured 30.7); U = 8: 8 ÷ 103 ms ≈ 78 models/s if the uploaders were never idle (measured 67.4, with the uploaders busy 86 % of the time).
3. **The pipeline is still upload-bound at U = 8, but less so.** Packers are blocked on a full queue 45 % of their time (74 % at U = 1). The first sign of the other limit shows up: at U = 8 uploaders wait about 24 ms each for packed models, mostly at the start of the run, before the queue fills.
4. **The cost of more uploaders is small here.** Peak RSS grows by about 30 MB (more models in flight); event-loop delay p99 doubles (3.6 → 7.7 ms) because more callbacks compete for the main thread, still far from the gRPC deadlines (2 s, 15 s). CPU time of the ingest process falls (1118 → 800 ms) because part of it is a fixed cost per millisecond of wall time (the 1 ms event-loop-delay timer, memory sampling, idle polling), and the run gets shorter.
5. **Why the default stays at 4 for now.** On loopback an upload's time is mostly CPU work in the stack, so more concurrency mostly adds contention. Against object storage over a network, an upload's time is mostly waiting (latency), which concurrency hides well: by Little's law the same 8 uploaders would gain much more. Choosing a default from a loopback measurement would tune for the wrong bottleneck; the sweep is repeated in the cluster (Stage 4) before the default changes.

## Limitations

- Same as the packing experiment: short runs (0.7–1.7 s), single machine, loopback storage, 5 runs per value.
- U = 16 (the CLI's maximum) is not measured; the trend says it would add little here.
- Queue size Q and pack concurrency P stay at their defaults; at U = 8 they start to matter (conclusion 3), so a sweep of Q with U = 8 is the next step on this machine.

## Reproducing

From a clean working tree, with the stack running and the first 50 models cached at 1k, after `pnpm --filter @meshdex/ingest build`, each run is:

```
node apps/ingest/dist/main.js import --resolution 1k --limit 50 \
  --pack-concurrency 2 --queue-size 4 --upload-concurrency <1|2|4|8> \
  --state <new empty state file> --record docs/benchmarks/runs --label 1k50-u<1|2|4|8>
```

in the order described under Method, with `LOG_LEVEL=warn`. Nothing in the working tree may change while runs are recorded: every record states whether the tree was clean.

## Runs

| Configuration | Files (`runs/`)                                                                                                                                                                                                                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| U = 1         | [22-54-26](runs/2026-11-12T22-54-26-677Z-import-1k50-u1.json), [22-54-40](runs/2026-11-12T22-54-40-194Z-import-1k50-u1.json), [22-55-00](runs/2026-11-12T22-55-00-157Z-import-1k50-u1.json), [22-55-14](runs/2026-11-12T22-55-14-205Z-import-1k50-u1.json), [22-55-21](runs/2026-11-12T22-55-21-069Z-import-1k50-u1.json) |
| U = 2         | [22-54-30](runs/2026-11-12T22-54-30-595Z-import-1k50-u2.json), [22-54-50](runs/2026-11-12T22-54-50-429Z-import-1k50-u2.json), [22-55-04](runs/2026-11-12T22-55-04-095Z-import-1k50-u2.json), [22-55-10](runs/2026-11-12T22-55-10-744Z-import-1k50-u2.json), [22-55-25](runs/2026-11-12T22-55-25-128Z-import-1k50-u2.json) |
| U = 4         | [22-54-33](runs/2026-11-12T22-54-33-925Z-import-1k50-u4.json), [22-54-47](runs/2026-11-12T22-54-47-223Z-import-1k50-u4.json), [22-54-53](runs/2026-11-12T22-54-53-916Z-import-1k50-u4.json), [22-55-07](runs/2026-11-12T22-55-07-492Z-import-1k50-u4.json), [22-55-28](runs/2026-11-12T22-55-28-527Z-import-1k50-u4.json) |
| U = 8         | [22-54-36](runs/2026-11-12T22-54-36-999Z-import-1k50-u8.json), [22-54-44](runs/2026-11-12T22-54-44-217Z-import-1k50-u8.json), [22-54-57](runs/2026-11-12T22-54-57-107Z-import-1k50-u8.json), [22-55-18](runs/2026-11-12T22-55-18-050Z-import-1k50-u8.json), [22-55-31](runs/2026-11-12T22-55-31-684Z-import-1k50-u8.json) |
