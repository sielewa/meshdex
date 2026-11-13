-- Rebuilds `embeddings` as a child of `embedded_versions` (002), with vectors stored inside rows.
--
-- Embeddings are derived data that the reindex job recomputes, so the table is rebuilt rather than
-- altered: rewriting it is the only way to move vectors already stored out of TOAST, and emptying
-- embedded_versions makes the next reindex embed every version again.
TRUNCATE embedded_versions;
DROP TABLE embeddings;

CREATE TABLE embeddings (
    -- Which version of the asset these images show is recorded once, in embedded_versions.
    model text NOT NULL,
    asset_id uuid NOT NULL,
    image_key text NOT NULL,
    -- L2-normalised, so cosine similarity equals the dot product.
    --
    -- STORAGE PLAIN keeps the vector inside the row. A 512-d vector is 2056 bytes, above
    -- Postgres' ~2 kB TOAST threshold, and pgvector's default (EXTERNAL) moves it to the TOAST
    -- table: every distance computed from the table then reads that table and its index too.
    -- Measured on 5000 rows, warm cache, both layouts interleaved (docs/data-processing.md):
    -- search p50 5.8 → 2.1 ms, exact and through HNSW alike.
    -- PLAIN rows must fit an 8 kB page: fine up to ~2000 dimensions.
    embedding vector(512) STORAGE PLAIN NOT NULL,
    -- Its leading columns (model, asset_id) also serve the foreign key and the deletion of an
    -- asset's previous rows, so no separate index is needed for either.
    PRIMARY KEY (model, asset_id, image_key),
    -- Inside the service's database relations are enforced by the database (ADR 005); removing
    -- an asset's embedded version removes its vectors.
    FOREIGN KEY (model, asset_id) REFERENCES embedded_versions (model, asset_id) ON DELETE CASCADE
)
-- A row (~2.1 kB) is still above the ~2 kB point where Postgres starts shrinking rows, and with
-- the vector pinned in place it would move the next widest value, image_key, to TOAST: an extra
-- TOAST write per row and an extra read whenever the key is selected. 8160 (the maximum, a full
-- page) means rows that fit a page are left alone.
WITH (toast_tuple_target = 8160);

-- Approximate nearest-neighbour search by cosine distance (`<=>`), pgvector defaults
-- (m = 16, ef_construction = 64) until the search evaluation compares settings.
CREATE INDEX embeddings_embedding_hnsw_idx ON embeddings USING hnsw (embedding vector_cosine_ops);
