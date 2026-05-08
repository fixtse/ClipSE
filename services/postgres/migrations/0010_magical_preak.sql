ALTER TABLE "content_clip" ADD COLUMN "clip_kind" varchar(20) DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "content_clip" ADD COLUMN "short_detection_mode" varchar(40) DEFAULT 'people' NOT NULL;--> statement-breakpoint
CREATE INDEX "content_clip_video_kind_idx" ON "content_clip" USING btree ("video_id","clip_kind");