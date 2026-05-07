ALTER TABLE "content_video" ADD COLUMN "intro_storage_key" text;--> statement-breakpoint
ALTER TABLE "content_video" ADD COLUMN "intro_mime_type" varchar(120);--> statement-breakpoint
ALTER TABLE "content_video" ADD COLUMN "outro_storage_key" text;--> statement-breakpoint
ALTER TABLE "content_video" ADD COLUMN "outro_mime_type" varchar(120);