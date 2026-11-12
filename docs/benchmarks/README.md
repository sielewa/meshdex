# Benchmarks

Measured performance of Meshdex, with the raw data behind every number ([ADR 014](../adr/014-benchmark-runs-as-json-in-the-repo.md)).

- `runs/`: one JSON file per recorded run (`<startedAt>-<command>[-<label>].json`), never edited after it is written. Each holds the options, the machine, the git commit (and whether the tree was dirty), the measurements and the result.
- `<topic>.md`: reports. Each states its methodology (warm-up, repeated runs, percentiles), the environment, links to the runs it uses and its conclusions.

## Reports

- [Ingest import: packing on the main thread vs in worker threads](ingest-import.md) (2026-11-12)

## Recording a run

```
pnpm --filter @meshdex/ingest start import --record ../../docs/benchmarks/runs --label <name>
```

Commit a run when it is worth keeping (a baseline, a sweep, before/after an optimisation), from a clean working tree so its `gitCommit` names the code that produced it. Exploratory runs go to `.claude-workdir/` or any scratch directory.
