CREATE TABLE "content_ai_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"provider" varchar(20) DEFAULT 'openai' NOT NULL,
	"openai_api_key" text DEFAULT '' NOT NULL,
	"openai_base_url" text DEFAULT '' NOT NULL,
	"openai_model" varchar(120) DEFAULT 'gpt-4o-mini' NOT NULL,
	"gemini_api_key" text DEFAULT '' NOT NULL,
	"gemini_model" varchar(120) DEFAULT 'gemini-2.5-flash' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_video" ADD COLUMN "source_type" varchar(20) DEFAULT 'file' NOT NULL;--> statement-breakpoint
ALTER TABLE "content_video" ADD COLUMN "source_url" text;