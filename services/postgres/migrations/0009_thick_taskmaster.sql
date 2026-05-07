ALTER TABLE "content_channel" ADD COLUMN "vertical_intro_storage_key" text;--> statement-breakpoint
ALTER TABLE "content_channel" ADD COLUMN "vertical_intro_mime_type" varchar(120);--> statement-breakpoint
ALTER TABLE "content_channel" ADD COLUMN "vertical_outro_storage_key" text;--> statement-breakpoint
ALTER TABLE "content_channel" ADD COLUMN "vertical_outro_mime_type" varchar(120);