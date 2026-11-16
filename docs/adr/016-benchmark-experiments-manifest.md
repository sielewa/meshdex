# ADR 016: Benchmark experiments defined in a manifest

- **Status:** accepted
- **Date:** 2026-11-13

## Context

The Experiments page (ADR 015) grouped runs only by workload: same command, same data, same machine. Two experiments on the same data then land in one group. The packing experiment (main thread vs worker threads) and the upload-concurrency sweep both import the first 50 models at 1k textures, so they would show as one comparison of six configurations that differ in three things at once (where packing runs, upload concurrency and commit), and the page could not tell that the sweep varies a single option. What is missing is the experiment itself: a question and the runs recorded to answer it. A run record cannot say which question it belongs to.

## Decision

**`docs/benchmarks/experiments.json` lists the experiments.** Each has an `id` (slug), a `title`, the `question` it answers, a one-sentence `answer` once it has one, the `report` in `docs/benchmarks/` that holds the method and conclusions, and the explicit list of run files that belong to it. A run may belong to more than one experiment (a baseline reused by a later one). The web app bundles the manifest with the runs at build time (ADR 015) and groups runs by experiment first, then by workload inside each experiment, so a comparison only ever contains the runs chosen for that question. A unit test checks that every committed run belongs to an experiment and every listed file exists.

Considered: **an `experiment` field in each run record** (`ingest import --experiment <slug>`), assigned when the run is recorded. Nothing to curate afterwards, but it changes the record format in two apps, leaves the 20 runs recorded before it without an experiment (records are never edited, ADR 014), and the title, question and report link would still need a place outside the records.

## Consequences

- Adding an experiment means recording its runs and then listing their files in the manifest, in the same commit. This matches how runs are kept: chosen deliberately, never all of them (ADR 014).
- The page can state each experiment's question and answer and name its report, so a reader of the page learns what was asked, not only what was measured.
- `docs/benchmarks/experiments.json` joins the runs directory in the web tasks' `inputs` in `turbo.json`.
