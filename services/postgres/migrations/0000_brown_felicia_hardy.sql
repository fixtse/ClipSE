CREATE TABLE "content_clip" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"title" varchar(255) NOT NULL,
	"hook" text DEFAULT '' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"rationale" text DEFAULT '' NOT NULL,
	"transcript_excerpt" text DEFAULT '' NOT NULL,
	"start_seconds" real NOT NULL,
	"end_seconds" real NOT NULL,
	"score" integer DEFAULT 50 NOT NULL,
	"status" varchar(40) DEFAULT 'suggested' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"output_storage_key" text,
	"output_filename" varchar(255),
	"latest_error" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid,
	"clip_id" uuid,
	"type" varchar(40) NOT NULL,
	"status" varchar(40) NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"runner_id" varchar(120),
	"last_error" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_transcription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"language" varchar(10) NOT NULL,
	"provider" varchar(80) NOT NULL,
	"model" varchar(120) NOT NULL,
	"segments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"full_text" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "content_transcription_video_id_unique" UNIQUE("video_id")
);
--> statement-breakpoint
CREATE TABLE "content_video" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"original_filename" varchar(255) NOT NULL,
	"title" varchar(255) NOT NULL,
	"analysis_prompt" text DEFAULT '' NOT NULL,
	"language_hint" varchar(10) DEFAULT 'auto' NOT NULL,
	"detected_language" varchar(10),
	"storage_key" text,
	"mime_type" varchar(120) NOT NULL,
	"size_bytes" integer NOT NULL,
	"duration_seconds" integer,
	"frame_rate" real,
	"waveform_samples" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"processing_stage" varchar(40) NOT NULL,
	"latest_error" text,
	"upload_completed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_clip" ADD CONSTRAINT "content_clip_video_id_content_video_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."content_video"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_job" ADD CONSTRAINT "content_job_video_id_content_video_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."content_video"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_job" ADD CONSTRAINT "content_job_clip_id_content_clip_id_fk" FOREIGN KEY ("clip_id") REFERENCES "public"."content_clip"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_transcription" ADD CONSTRAINT "content_transcription_video_id_content_video_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."content_video"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_clip_video_idx" ON "content_clip" USING btree ("video_id");--> statement-breakpoint
CREATE INDEX "content_clip_status_idx" ON "content_clip" USING btree ("status");--> statement-breakpoint
CREATE INDEX "content_job_status_idx" ON "content_job" USING btree ("status");--> statement-breakpoint
CREATE INDEX "content_job_type_idx" ON "content_job" USING btree ("type");--> statement-breakpoint
CREATE INDEX "content_job_video_idx" ON "content_job" USING btree ("video_id");--> statement-breakpoint
CREATE INDEX "content_job_clip_idx" ON "content_job" USING btree ("clip_id");--> statement-breakpoint
CREATE INDEX "content_transcription_video_idx" ON "content_transcription" USING btree ("video_id");--> statement-breakpoint
CREATE INDEX "content_video_stage_idx" ON "content_video" USING btree ("processing_stage");--> statement-breakpoint
CREATE INDEX "content_video_created_idx" ON "content_video" USING btree ("created_at");