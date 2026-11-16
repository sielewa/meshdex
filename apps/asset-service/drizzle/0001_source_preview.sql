ALTER TABLE "asset_versions" ADD COLUMN "source_preview_key" text;--> statement-breakpoint
ALTER TABLE "asset_versions" ADD COLUMN "source_preview_size_bytes" bigint;--> statement-breakpoint
ALTER TABLE "asset_versions" ADD COLUMN "source_preview_content_type" text;--> statement-breakpoint
ALTER TABLE "asset_versions" ADD CONSTRAINT "asset_versions_source_preview_complete" CHECK (("asset_versions"."source_preview_key" IS NULL) = ("asset_versions"."source_preview_size_bytes" IS NULL) AND ("asset_versions"."source_preview_key" IS NULL) = ("asset_versions"."source_preview_content_type" IS NULL));