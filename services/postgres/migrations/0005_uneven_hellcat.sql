CREATE TABLE "content_channel" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"logo_storage_key" text,
	"logo_mime_type" varchar(120),
	"intro_storage_key" text,
	"intro_mime_type" varchar(120),
	"outro_storage_key" text,
	"outro_mime_type" varchar(120),
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_video" ADD COLUMN "channel_id" uuid;--> statement-breakpoint
CREATE INDEX "content_channel_created_idx" ON "content_channel" USING btree ("created_at");--> statement-breakpoint
INSERT INTO "content_channel" (
	"name",
	"intro_storage_key",
	"intro_mime_type",
	"outro_storage_key",
	"outro_mime_type",
	"created_at",
	"updated_at"
)
SELECT
	'Default',
	(
		SELECT "intro_storage_key"
		FROM "content_video"
		WHERE "intro_storage_key" IS NOT NULL
		ORDER BY "updated_at" DESC
		LIMIT 1
	),
	(
		SELECT "intro_mime_type"
		FROM "content_video"
		WHERE "intro_storage_key" IS NOT NULL
		ORDER BY "updated_at" DESC
		LIMIT 1
	),
	(
		SELECT "outro_storage_key"
		FROM "content_video"
		WHERE "outro_storage_key" IS NOT NULL
		ORDER BY "updated_at" DESC
		LIMIT 1
	),
	(
		SELECT "outro_mime_type"
		FROM "content_video"
		WHERE "outro_storage_key" IS NOT NULL
		ORDER BY "updated_at" DESC
		LIMIT 1
	),
	NOW(),
	NOW()
WHERE EXISTS (SELECT 1 FROM "content_video");
--> statement-breakpoint
UPDATE "content_video"
SET "channel_id" = (
	SELECT "id"
	FROM "content_channel"
	WHERE "name" = 'Default'
	ORDER BY "created_at" ASC
	LIMIT 1
)
WHERE "channel_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "content_video" ADD CONSTRAINT "content_video_channel_id_content_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."content_channel"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_video_channel_idx" ON "content_video" USING btree ("channel_id");
