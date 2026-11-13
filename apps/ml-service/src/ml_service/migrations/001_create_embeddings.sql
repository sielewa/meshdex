-- Embeddings of images showing asset versions (ADR 017, 018): one row per image and model, so two
-- CLIP models can be stored side by side for the search evaluation. Only the newest embedded
-- version of an asset is kept. The `vector` extension is created by the infrastructure as
-- superuser, not here (ADR 018).
CREATE TABLE embeddings (
    -- Ids owned by asset-service; no foreign keys across services (ADR 005).
    asset_id uuid NOT NULL,
    asset_version_id uuid NOT NULL,
    -- Per-asset version number: a write for an older version than the stored one is ignored.
    version_number integer NOT NULL,
    image_key text NOT NULL,
    -- open_clip architecture and weights, e.g. 'ViT-B-32/laion2b_s34b_b79k'.
    model text NOT NULL,
    -- L2-normalised, so cosine similarity equals the dot product.
    embedding vector(512) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (model, asset_version_id, image_key)
);

-- Looking up the stored version of an asset when a newer one is written.
CREATE INDEX embeddings_asset_id_model_idx ON embeddings (asset_id, model);

-- Approximate nearest-neighbour search by cosine distance (`<=>`), pgvector defaults
-- (m = 16, ef_construction = 64) until the search evaluation compares settings.
CREATE INDEX embeddings_embedding_hnsw_idx ON embeddings USING hnsw (embedding vector_cosine_ops);
