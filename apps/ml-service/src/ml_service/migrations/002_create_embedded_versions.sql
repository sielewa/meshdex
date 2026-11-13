-- The embedded version of each asset, per model (ADR 018). Writers upsert this row first, under the
-- condition that their version is not older than the stored one: the row lock serialises
-- concurrent writers of the same asset, the condition rejects out-of-order versions, and the
-- reindex job reads it to skip versions that are already embedded.
CREATE TABLE embedded_versions (
    model text NOT NULL,
    -- Ids owned by asset-service; no foreign keys across services (ADR 005).
    asset_id uuid NOT NULL,
    asset_version_id uuid NOT NULL,
    version_number integer NOT NULL,
    embedded_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (model, asset_id)
);
