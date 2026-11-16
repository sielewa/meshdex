CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"asset_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"status" text NOT NULL,
	"original_key" text NOT NULL,
	"original_size_bytes" bigint NOT NULL,
	"original_content_type" text NOT NULL,
	"original_file_name" text NOT NULL,
	"upload_id" text,
	"part_size_bytes" integer NOT NULL,
	"optimized_key" text,
	"optimized_size_bytes" bigint,
	"optimized_content_type" text,
	"thumbnails" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"stats" jsonb,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"uploaded_at" timestamp with time zone,
	"processing_started_at" timestamp with time zone,
	"processed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tags_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tags_name_unique" UNIQUE("name"),
	CONSTRAINT "tags_name_normalized" CHECK ("tags"."name" = lower(btrim("tags"."name")) AND length("tags"."name") BETWEEN 1 AND 50)
);
--> statement-breakpoint
CREATE TABLE "asset_tags" (
	"asset_id" uuid NOT NULL,
	"tag_id" bigint NOT NULL,
	CONSTRAINT "asset_tags_pk" PRIMARY KEY("asset_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"sequence" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "outbox_sequence_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"event_id" uuid NOT NULL,
	"topic" text NOT NULL,
	"key" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "outbox_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
ALTER TABLE "asset_versions" ADD CONSTRAINT "asset_versions_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_tags" ADD CONSTRAINT "asset_tags_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_tags" ADD CONSTRAINT "asset_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assets_created_at_id_idx" ON "assets" USING btree ("created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE UNIQUE INDEX "asset_versions_asset_id_number_idx" ON "asset_versions" USING btree ("asset_id","number");--> statement-breakpoint
CREATE INDEX "asset_versions_status_idx" ON "asset_versions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "asset_tags_tag_id_asset_id_idx" ON "asset_tags" USING btree ("tag_id","asset_id");--> statement-breakpoint
CREATE INDEX "outbox_unpublished_idx" ON "outbox" USING btree ("sequence") WHERE "outbox"."published_at" IS NULL;