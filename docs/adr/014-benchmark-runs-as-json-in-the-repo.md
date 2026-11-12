# ADR 014: Benchmark runs as JSON files in the repository

- **Status:** accepted
- **Date:** 2026-11-12

## Context

`ingest import` measures every run (wall and CPU time, memory peaks, event-loop delay, throughput, where the pipeline waited) and can write the measurements as one JSON file per run (`--record <dir> --label <name>`). The roadmap asks for benchmark runs to be kept and compared in the web UI (Experiments), and the point of keeping them is history: showing that after an optimisation the same import is faster than it was days before, and which change did it. That needs a place where runs live permanently and a link from each run to the code that produced it.

## Decision

**Selected runs are committed as JSON files in `docs/benchmarks/runs/`.** A run is recorded straight into that directory (`--record ../../docs/benchmarks/runs`) and committed when it is worth keeping: a baseline, a configuration sweep, the before and after of an optimisation. Reports in `docs/benchmarks/` cite these files, and the web Experiments page reads them when it is built. Every record carries the git commit it was run from and whether the working tree had uncommitted changes, so a number always points at the code behind it.

Considered: **runs stored in a database behind a service** (ingest sends each record over gRPC to an `experiment_runs` table; the web reads them through the gateway). Every run would be kept automatically, including runs inside Kubernetes, where the ingest pod has no lasting disk, and runs could be filtered and charted over time like production data. It costs a new contract, a migration, a gateway endpoint and a page that reads it, about a day of work, for data that is small and written by one person. The record format is the same either way, so moving to a service later means sending the same JSON, not measuring differently.

## Consequences

- History is explicit: only runs someone chose to commit are kept, each tied to a commit. Exploratory runs go to a scratch directory and are dropped.
- Files are small (about 1–2 KB) and never overwritten (one file per run, `wx`), so the directory only grows.
- Runs measured inside the cluster (Stage 4 "done when") are written to a volume of the ingest Job and copied out (`kubectl cp`) before being committed; collecting them automatically is the trigger to revisit the database option.
- The web build needs `docs/benchmarks/runs/` in its build context.
