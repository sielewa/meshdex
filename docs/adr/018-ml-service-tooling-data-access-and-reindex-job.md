# ADR 018: ml-service tooling, data access and the reindex job

- **Status:** accepted
- **Date:** 2026-11-13

## Context

`ml-service` is the first Python service. It embeds images of assets with CLIP and answers text queries with pgvector (`meshdex.ml.v1`). Three things weren't decided: the Python tooling (a pending item in the ADR index), how the service talks to its database, and how the assets that already exist get embeddings. The last one matters now: `EmbedAsset` is meant to be called by the processing worker after it renders thumbnails (Stage 2), and the worker doesn't exist yet. The first search (roadmap, priority 4) embeds source preview images (ADR 017) of models that are already imported.

Embedding a catalogue is also the main data-loading problem of the project: every image is fetched from object storage (network), decoded and resized (CPU) and run through the model in batches (matrix math). The roadmap asks to measure throughput against workers, batch size and prefetch depth and to name the bottleneck.

## Decision

### Tooling: uv, ruff, mypy, pytest

- **uv** manages the interpreter (Python 3.12, `requires-python` + `.python-version`), the virtual environment and the lockfile (`apps/ml-service/pyproject.toml`, `uv.lock`). Commands run through `uv run`, so nobody activates a venv by hand.
- **ruff** for linting and formatting (replaces flake8, isort and black, one config in `pyproject.toml`).
- **mypy `--strict`** for type checking.
- **pytest** for tests.
- Source in `src/ml_service/` (src layout: tests import the installed package, not the working directory), tests in `tests/`.
- Python code for `meshdex.ml.v1` and `meshdex.asset.v1` is generated with `grpcio-tools` inside ml-service into `src/ml_service/gen/` (gitignored), with `.pyi` stubs for messages and `mypy-protobuf` stubs for the service classes, so mypy checks the transport layer too.
- A thin `package.json` in `apps/ml-service` delegates `dev`, `lint`, `typecheck`, `test` to `uv run …`, so `pnpm lint` / `pnpm test` through Turbo cover Python as well.

Considered: **Poetry** (mature, but slower, no interpreter management), **pip-tools + venv** (no single tool, manual steps), **pyright** instead of mypy (faster, but mypy is the reference checker and has the protobuf stub plugin we use).

### Database: psycopg 3, plain SQL, numbered SQL migrations

- **psycopg 3** with `psycopg_pool` (one pool per process, sized like the Node services' pools) and **pgvector-python** to adapt `vector` columns to numpy arrays.
- Repositories write SQL by hand. The queries that matter are vector-specific (`ORDER BY embedding <=> $1`, HNSW parameters), an ORM would only wrap them.
- Migrations are numbered files `apps/ml-service/src/ml_service/migrations/NNN_name.sql` (inside the package, so they ship with it and are found from any working directory), applied in order by a small runner (`python -m ml_service migrate`): each file in its own transaction, applied versions recorded in `schema_migrations` with a checksum of the SQL (editing an applied migration is an error), a Postgres advisory lock so two pods starting together don't race. The `vector` extension is created by the infrastructure (superuser), not by migrations, as for the local init script.
- ADR 005 applies (snake_case, `timestamptz`, text enums). Embeddings are stored one row per embedded image together with the model name, so two CLIP models can coexist for the search evaluation. Only the newest embedded version of an asset is kept. Search uses an HNSW index with cosine distance.

Considered: **SQLAlchemy + Alembic** (standard pair, but an ORM layer and an autogenerate step that handles pgvector types poorly, for two tables and hand-tuned queries), **yoyo-migrations** (a dependency for what fits in ~50 lines).

### Existing assets: a reindex job inside ml-service

`python -m ml_service reindex` embeds every asset version that has an image and no embedding for the configured model yet:

1. **List.** Pages through `asset-service.ListAssets` over gRPC (database per service: no reads of asset-service tables) and collects `(asset id, version id, version number, image key)`. A catalogue of thousands of rows fits in memory, so listing finishes before loading starts and the work has a known size.
2. **Load: `torch.utils.data.DataLoader`.** A map-style `Dataset` fetches one image from object storage, decodes it with Pillow and applies the model's preprocessing. `num_workers` worker processes do this in parallel; each keeps `prefetch_factor` batches ready ahead of the model, which is the prefetch depth. Processes, not threads: decoding and resizing in Python hold the GIL. Each worker creates its own S3 client on first use (clients aren't shared across processes).
3. **Embed.** The main process runs CLIP on each batch (`batch_size`) under `torch.inference_mode()` and L2-normalises the vectors, so cosine similarity is a dot product.
4. **Write.** Each batch is written with one statement, not one per row.

The job is resumable (already embedded versions are skipped) and idempotent (a repeated write replaces, an older version never overwrites a newer one, same rule as `EmbedAsset`). It measures, per batch, how long the model waited for data, the model time and the write time: if the model mostly waits, loading is the bottleneck; if the loader is ahead, the model is. Runs are recorded as JSON (ADR 014) and compared on the Experiments page.

`EmbedAsset` and the job share the same embedding and storage code; the job is another entry point, not a client of its own gRPC API.

Considered: **a hand-rolled pipeline** (threads for downloads, a process pool for decoding, bounded queues between stages, like ingest). It gives full control and per-stage backpressure, but rebuilds what DataLoader already does and is the tool ML engineers expect. **Calling `EmbedAsset` from a script**: one asset per call, and the dynamic batching the contract promises would have to exist first.

### Object storage: S3 API through boto3

Images are read with `GetObject` through **boto3**, using the endpoint from config (SeaweedFS locally, like the Node services, ADR 002). It works for private files as well as `public/` ones, and inside AWS reads from the same region cost nothing. Locally the service uses the dev identity; in the cloud it gets a read-only IAM role (Stage 7).

Considered: **HTTP GET on `MEDIA_BASE_URL + key`** (no credentials, no extra dependency), but only for public files, and in the cloud every read would go through CloudFront.

### Model weights

The model is open_clip `ViT-B-32` with `laion2b_s34b_b79k` weights (512 dimensions). The service loads the weights from a local file set in config and never downloads them at runtime: offline mode for the Hugging Face hub is set, and a missing file fails at startup. Getting the file is an explicit step (locally the user's, in Kubernetes part of the image or a volume, decided in Stage 3). `device` (`cpu`, `mps`, `cuda`) is config.

## Consequences

- Closes the pending "Python tooling" decision.
- `ml-service` has its own lockfile outside pnpm. Dependency changes there belong to the user, like `package.json` (CLAUDE.md, rule 4).
- The first search works on source previews of imported models without the processing worker. When the worker exists, it calls `EmbedAsset` for new versions and the job stays useful to backfill a new model or recover from a lost index.
- DataLoader workers use the `spawn` start method on macOS, so the `Dataset` and everything it holds must be picklable, and each worker pays the import cost once at start. The benchmark has to separate this startup time from steady-state throughput.
- A second CLIP model with a different dimension (e.g. 768) can't share the `vector(512)` column type and index. The evaluation (Stage 5) adds a partial expression index per model or a second column, decided then.
- Python dependencies to add (user): `grpcio`, `grpcio-tools`, `protobuf`, `open-clip-torch`, `torch`, `pillow`, `boto3`, `psycopg[binary,pool]`, `pgvector`, `numpy`, `pydantic-settings`; dev: `ruff`, `mypy`, `pytest`, `mypy-protobuf`, `types-protobuf`, `types-grpcio`, `boto3-stubs[s3]`.
