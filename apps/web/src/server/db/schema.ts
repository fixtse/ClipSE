import { relations, sql } from "drizzle-orm";
import { index, pgTableCreator } from "drizzle-orm/pg-core";

export const createTable = pgTableCreator((name) => name);

// Better Auth tables

export const user = createTable("user", (d) => ({
	id: d.text().primaryKey(),
	name: d.text().notNull(),
	email: d.text().notNull().unique(),
	emailVerified: d.boolean("emailVerified").notNull().default(false),
	image: d.text(),
	createdAt: d.timestamp("createdAt", { withTimezone: true }).notNull(),
	updatedAt: d.timestamp("updatedAt", { withTimezone: true }).notNull(),
}));

export const session = createTable(
	"session",
	(d) => ({
		id: d.text().primaryKey(),
		expiresAt: d.timestamp("expiresAt", { withTimezone: true }).notNull(),
		token: d.text().notNull().unique(),
		createdAt: d.timestamp("createdAt", { withTimezone: true }).notNull(),
		updatedAt: d.timestamp("updatedAt", { withTimezone: true }).notNull(),
		ipAddress: d.text("ipAddress"),
		userAgent: d.text("userAgent"),
		userId: d
			.text("userId")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
	}),
	(t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = createTable(
	"account",
	(d) => ({
		id: d.text().primaryKey(),
		accountId: d.text("accountId").notNull(),
		providerId: d.text("providerId").notNull(),
		userId: d
			.text("userId")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		accessToken: d.text("accessToken"),
		refreshToken: d.text("refreshToken"),
		idToken: d.text("idToken"),
		accessTokenExpiresAt: d.timestamp("accessTokenExpiresAt", {
			withTimezone: true,
		}),
		refreshTokenExpiresAt: d.timestamp("refreshTokenExpiresAt", {
			withTimezone: true,
		}),
		scope: d.text(),
		password: d.text(),
		createdAt: d.timestamp("createdAt", { withTimezone: true }).notNull(),
		updatedAt: d.timestamp("updatedAt", { withTimezone: true }).notNull(),
	}),
	(t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = createTable(
	"verification",
	(d) => ({
		id: d.text().primaryKey(),
		identifier: d.text().notNull(),
		value: d.text().notNull(),
		expiresAt: d.timestamp("expiresAt", { withTimezone: true }).notNull(),
		createdAt: d.timestamp("createdAt", { withTimezone: true }).notNull(),
		updatedAt: d.timestamp("updatedAt", { withTimezone: true }).notNull(),
	}),
	(t) => [index("verification_identifier_idx").on(t.identifier)],
);

// ClipSE tables

export const contentChannels = createTable(
	"content_channel",
	(d) => ({
		id: d.uuid().primaryKey().defaultRandom(),
		name: d.varchar({ length: 120 }).notNull(),
		logoStorageKey: d.text("logo_storage_key"),
		logoMimeType: d.varchar("logo_mime_type", { length: 120 }),
		introStorageKey: d.text("intro_storage_key"),
		introMimeType: d.varchar("intro_mime_type", { length: 120 }),
		outroStorageKey: d.text("outro_storage_key"),
		outroMimeType: d.varchar("outro_mime_type", { length: 120 }),
		verticalIntroStorageKey: d.text("vertical_intro_storage_key"),
		verticalIntroMimeType: d.varchar("vertical_intro_mime_type", {
			length: 120,
		}),
		verticalOutroStorageKey: d.text("vertical_outro_storage_key"),
		verticalOutroMimeType: d.varchar("vertical_outro_mime_type", {
			length: 120,
		}),
		createdAt: d
			.timestamp("created_at", { withTimezone: true })
			.$defaultFn(() => new Date())
			.notNull(),
		updatedAt: d
			.timestamp("updated_at", { withTimezone: true })
			.$defaultFn(() => new Date())
			.$onUpdate(() => new Date())
			.notNull(),
	}),
	(t) => [index("content_channel_created_idx").on(t.createdAt)],
);

export const contentVideos = createTable(
	"content_video",
	(d) => ({
		id: d.uuid().primaryKey().defaultRandom(),
		channelId: d
			.uuid("channel_id")
			.references(() => contentChannels.id, { onDelete: "set null" }),
		originalFilename: d.varchar("original_filename", { length: 255 }).notNull(),
		title: d.varchar({ length: 255 }).notNull(),
		analysisPrompt: d.text("analysis_prompt").notNull().default(""),
		sourceType: d
			.varchar("source_type", { length: 20 })
			.notNull()
			.default("file"),
		sourceUrl: d.text("source_url"),
		languageHint: d
			.varchar("language_hint", { length: 10 })
			.notNull()
			.default("auto"),
		detectedLanguage: d.varchar("detected_language", { length: 10 }),
		storageKey: d.text("storage_key"),
		introStorageKey: d.text("intro_storage_key"),
		introMimeType: d.varchar("intro_mime_type", { length: 120 }),
		outroStorageKey: d.text("outro_storage_key"),
		outroMimeType: d.varchar("outro_mime_type", { length: 120 }),
		mimeType: d.varchar("mime_type", { length: 120 }).notNull(),
		sizeBytes: d.bigint("size_bytes", { mode: "number" }).notNull(),
		durationSeconds: d.integer("duration_seconds"),
		frameRate: d.real("frame_rate"),
		waveformSamples: d
			.jsonb("waveform_samples")
			.notNull()
			.default(sql`'[]'::jsonb`),
		processingStage: d.varchar("processing_stage", { length: 40 }).notNull(),
		latestError: d.text("latest_error"),
		uploadCompletedAt: d.timestamp("upload_completed_at", {
			withTimezone: true,
		}),
		createdAt: d
			.timestamp("created_at", { withTimezone: true })
			.$defaultFn(() => new Date())
			.notNull(),
		updatedAt: d
			.timestamp("updated_at", { withTimezone: true })
			.$defaultFn(() => new Date())
			.$onUpdate(() => new Date())
			.notNull(),
	}),
	(t) => [
		index("content_video_channel_idx").on(t.channelId),
		index("content_video_stage_idx").on(t.processingStage),
		index("content_video_created_idx").on(t.createdAt),
	],
);

export const contentAiSettings = createTable("content_ai_settings", (d) => ({
	id: d.integer().primaryKey().default(1),
	provider: d.varchar({ length: 20 }).notNull().default("openai"),
	openaiApiKey: d.text("openai_api_key").notNull().default(""),
	openaiBaseUrl: d.text("openai_base_url").notNull().default(""),
	openaiModel: d
		.varchar("openai_model", { length: 120 })
		.notNull()
		.default("gpt-4o-mini"),
	geminiApiKey: d.text("gemini_api_key").notNull().default(""),
	geminiModel: d
		.varchar("gemini_model", { length: 120 })
		.notNull()
		.default("gemini-2.5-flash"),
	openrouterApiKey: d.text("openrouter_api_key").notNull().default(""),
	openrouterModel: d
		.varchar("openrouter_model", { length: 180 })
		.notNull()
		.default(""),
	codexModel: d
		.varchar("codex_model", { length: 180 })
		.notNull()
		.default("gpt-5.3-codex"),
	whisperProvider: d
		.varchar("whisper_provider", { length: 40 })
		.notNull()
		.default("faster-whisper"),
	whisperModel: d
		.varchar("whisper_model", { length: 40 })
		.notNull()
		.default("medium"),
	whisperChunkingEnabled: d
		.boolean("whisper_chunking_enabled")
		.notNull()
		.default(false),
	whisperChunkMinutes: d.integer("whisper_chunk_minutes").notNull().default(20),
	subtitleColor: d
		.varchar("subtitle_color", { length: 7 })
		.notNull()
		.default("#ffffff"),
	subtitleFontFamily: d
		.varchar("subtitle_font_family", { length: 80 })
		.notNull()
		.default("Arial"),
	createdAt: d
		.timestamp("created_at", { withTimezone: true })
		.$defaultFn(() => new Date())
		.notNull(),
	updatedAt: d
		.timestamp("updated_at", { withTimezone: true })
		.$defaultFn(() => new Date())
		.$onUpdate(() => new Date())
		.notNull(),
}));

export const contentTranscriptions = createTable(
	"content_transcription",
	(d) => ({
		id: d.uuid().primaryKey().defaultRandom(),
		videoId: d
			.uuid("video_id")
			.notNull()
			.references(() => contentVideos.id, { onDelete: "cascade" })
			.unique(),
		language: d.varchar({ length: 10 }).notNull(),
		provider: d.varchar({ length: 80 }).notNull(),
		model: d.varchar({ length: 120 }).notNull(),
		segments: d.jsonb().notNull().default(sql`'[]'::jsonb`),
		fullText: d.text("full_text").notNull(),
		metadata: d.jsonb().notNull().default(sql`'{}'::jsonb`),
		createdAt: d
			.timestamp("created_at", { withTimezone: true })
			.$defaultFn(() => new Date())
			.notNull(),
		updatedAt: d
			.timestamp("updated_at", { withTimezone: true })
			.$defaultFn(() => new Date())
			.$onUpdate(() => new Date())
			.notNull(),
	}),
	(t) => [index("content_transcription_video_idx").on(t.videoId)],
);

export const contentClips = createTable(
	"content_clip",
	(d) => ({
		id: d.uuid().primaryKey().defaultRandom(),
		videoId: d
			.uuid("video_id")
			.notNull()
			.references(() => contentVideos.id, { onDelete: "cascade" }),
		clipKind: d
			.varchar("clip_kind", { length: 20 })
			.notNull()
			.default("standard"),
		shortDetectionMode: d
			.varchar("short_detection_mode", { length: 40 })
			.notNull()
			.default("people"),
		orderIndex: d.integer("order_index").notNull().default(0),
		title: d.varchar({ length: 255 }).notNull(),
		hook: d.text().notNull().default(""),
		summary: d.text().notNull().default(""),
		rationale: d.text().notNull().default(""),
		transcriptExcerpt: d.text("transcript_excerpt").notNull().default(""),
		startSeconds: d.real("start_seconds").notNull(),
		endSeconds: d.real("end_seconds").notNull(),
		score: d.integer().notNull().default(50),
		status: d.varchar({ length: 40 }).notNull().default("suggested"),
		tags: d.jsonb().notNull().default(sql`'[]'::jsonb`),
		outputStorageKey: d.text("output_storage_key"),
		outputFilename: d.varchar("output_filename", { length: 255 }),
		downloadedAt: d.timestamp("downloaded_at", { withTimezone: true }),
		latestError: d.text("latest_error"),
		createdAt: d
			.timestamp("created_at", { withTimezone: true })
			.$defaultFn(() => new Date())
			.notNull(),
		updatedAt: d
			.timestamp("updated_at", { withTimezone: true })
			.$defaultFn(() => new Date())
			.$onUpdate(() => new Date())
			.notNull(),
	}),
	(t) => [
		index("content_clip_video_idx").on(t.videoId),
		index("content_clip_video_kind_idx").on(t.videoId, t.clipKind),
		index("content_clip_status_idx").on(t.status),
	],
);

export const contentChapters = createTable(
	"content_chapter",
	(d) => ({
		id: d.uuid().primaryKey().defaultRandom(),
		videoId: d
			.uuid("video_id")
			.notNull()
			.references(() => contentVideos.id, { onDelete: "cascade" }),
		orderIndex: d.integer("order_index").notNull().default(0),
		title: d.varchar({ length: 120 }).notNull(),
		startSeconds: d.real("start_seconds").notNull(),
		endSeconds: d.real("end_seconds").notNull(),
		summary: d.text().notNull().default(""),
		relatedClipIndexes: d
			.jsonb("related_clip_indexes")
			.notNull()
			.default(sql`'[]'::jsonb`),
		confidence: d.real().notNull().default(0.7),
		createdAt: d
			.timestamp("created_at", { withTimezone: true })
			.$defaultFn(() => new Date())
			.notNull(),
		updatedAt: d
			.timestamp("updated_at", { withTimezone: true })
			.$defaultFn(() => new Date())
			.$onUpdate(() => new Date())
			.notNull(),
	}),
	(t) => [index("content_chapter_video_idx").on(t.videoId)],
);

export const contentJobs = createTable(
	"content_job",
	(d) => ({
		id: d.uuid().primaryKey().defaultRandom(),
		videoId: d
			.uuid("video_id")
			.references(() => contentVideos.id, { onDelete: "cascade" }),
		clipId: d
			.uuid("clip_id")
			.references(() => contentClips.id, { onDelete: "cascade" }),
		type: d.varchar({ length: 40 }).notNull(),
		status: d.varchar({ length: 40 }).notNull(),
		progress: d.integer().notNull().default(0),
		attempts: d.integer().notNull().default(0),
		maxAttempts: d.integer("max_attempts").notNull().default(3),
		payload: d.jsonb().notNull().default(sql`'{}'::jsonb`),
		result: d.jsonb().notNull().default(sql`'{}'::jsonb`),
		runnerId: d.varchar("runner_id", { length: 120 }),
		lastError: d.text("last_error"),
		startedAt: d.timestamp("started_at", { withTimezone: true }),
		completedAt: d.timestamp("completed_at", { withTimezone: true }),
		lockedAt: d.timestamp("locked_at", { withTimezone: true }),
		createdAt: d
			.timestamp("created_at", { withTimezone: true })
			.$defaultFn(() => new Date())
			.notNull(),
		updatedAt: d
			.timestamp("updated_at", { withTimezone: true })
			.$defaultFn(() => new Date())
			.$onUpdate(() => new Date())
			.notNull(),
	}),
	(t) => [
		index("content_job_status_idx").on(t.status),
		index("content_job_type_idx").on(t.type),
		index("content_job_video_idx").on(t.videoId),
		index("content_job_clip_idx").on(t.clipId),
	],
);

export const contentVideoRelations = relations(
	contentVideos,
	({ many, one }) => ({
		channel: one(contentChannels, {
			fields: [contentVideos.channelId],
			references: [contentChannels.id],
		}),
		transcription: one(contentTranscriptions),
		clips: many(contentClips),
		chapters: many(contentChapters),
		jobs: many(contentJobs),
	}),
);

export const contentChannelRelations = relations(
	contentChannels,
	({ many }) => ({
		videos: many(contentVideos),
	}),
);

export const contentTranscriptionRelations = relations(
	contentTranscriptions,
	({ one }) => ({
		video: one(contentVideos, {
			fields: [contentTranscriptions.videoId],
			references: [contentVideos.id],
		}),
	}),
);

export const contentClipRelations = relations(
	contentClips,
	({ many, one }) => ({
		video: one(contentVideos, {
			fields: [contentClips.videoId],
			references: [contentVideos.id],
		}),
		jobs: many(contentJobs),
	}),
);

export const contentChapterRelations = relations(
	contentChapters,
	({ one }) => ({
		video: one(contentVideos, {
			fields: [contentChapters.videoId],
			references: [contentVideos.id],
		}),
	}),
);

export const contentJobRelations = relations(contentJobs, ({ one }) => ({
	video: one(contentVideos, {
		fields: [contentJobs.videoId],
		references: [contentVideos.id],
	}),
	clip: one(contentClips, {
		fields: [contentJobs.clipId],
		references: [contentClips.id],
	}),
}));
