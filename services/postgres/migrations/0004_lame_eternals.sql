CREATE TABLE "content_chapter" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"title" varchar(120) NOT NULL,
	"start_seconds" real NOT NULL,
	"end_seconds" real NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"related_clip_indexes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confidence" real DEFAULT 0.7 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_chapter" ADD CONSTRAINT "content_chapter_video_id_content_video_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."content_video"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_chapter_video_idx" ON "content_chapter" USING btree ("video_id");