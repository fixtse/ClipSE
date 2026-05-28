import { eq } from "drizzle-orm";
import { db } from "~/server/db";
import { contentAiSettings } from "~/server/db/schema";
import type { ContentAiSettingsRepositoryInterface } from "../domain/content-ai-settings.repository.interface";
import type {
	ContentAiSettings,
	UpdateContentAiSettingsInput,
} from "../domain/content-ai-settings.valueobject";
import {
	SUBTITLE_FONT_FAMILIES,
	WHISPER_MODELS,
	WHISPER_PROVIDERS,
} from "../domain/content-ai-settings.valueobject";

const SETTINGS_ID = 1;
const DEFAULT_WHISPER_CHUNK_MINUTES = 20;
const DEFAULT_SUBTITLE_COLOR = "#ffffff";
const DEFAULT_SUBTITLE_HIGHLIGHT_COLOR = "#ffe45c";
const DEFAULT_SUBTITLE_FONT_FAMILY = "Arial";

function normalizeWhisperModel(
	model: string,
): ContentAiSettings["whisperModel"] {
	return WHISPER_MODELS.includes(model as ContentAiSettings["whisperModel"])
		? (model as ContentAiSettings["whisperModel"])
		: "medium";
}

function normalizeWhisperProvider(
	provider: string,
): ContentAiSettings["whisperProvider"] {
	return WHISPER_PROVIDERS.includes(
		provider as ContentAiSettings["whisperProvider"],
	)
		? (provider as ContentAiSettings["whisperProvider"])
		: "faster-whisper";
}

function normalizeSubtitleColor(color: string): string {
	return /^#[0-9A-Fa-f]{6}$/.test(color)
		? color.toLowerCase()
		: DEFAULT_SUBTITLE_COLOR;
}

function normalizeSubtitleHighlightColor(color: string): string {
	return /^#[0-9A-Fa-f]{6}$/.test(color)
		? color.toLowerCase()
		: DEFAULT_SUBTITLE_HIGHLIGHT_COLOR;
}

function normalizeSubtitleFontFamily(
	fontFamily: string,
): ContentAiSettings["subtitleFontFamily"] {
	return SUBTITLE_FONT_FAMILIES.includes(
		fontFamily as ContentAiSettings["subtitleFontFamily"],
	)
		? (fontFamily as ContentAiSettings["subtitleFontFamily"])
		: DEFAULT_SUBTITLE_FONT_FAMILY;
}

export class ContentAiSettingsRepository
	implements ContentAiSettingsRepositoryInterface
{
	async get(): Promise<ContentAiSettings> {
		const [settings] = await db
			.select()
			.from(contentAiSettings)
			.where(eq(contentAiSettings.id, SETTINGS_ID));

		if (settings) {
			return this.map(settings);
		}

		const [created] = await db
			.insert(contentAiSettings)
			.values({
				id: SETTINGS_ID,
				provider: "openai",
				openaiApiKey: "",
				openaiBaseUrl: "",
				openaiModel: "gpt-4o-mini",
				geminiApiKey: "",
				geminiModel: "gemini-2.5-flash",
				openrouterApiKey: "",
				openrouterModel: "",
				codexModel: "gpt-5.3-codex",
				whisperProvider: "faster-whisper",
				whisperModel: "medium",
				whisperChunkingEnabled: false,
				whisperChunkMinutes: DEFAULT_WHISPER_CHUNK_MINUTES,
				subtitleColor: DEFAULT_SUBTITLE_COLOR,
				subtitleHighlightColor: DEFAULT_SUBTITLE_HIGHLIGHT_COLOR,
				subtitleFontFamily: DEFAULT_SUBTITLE_FONT_FAMILY,
				createdAt: new Date(),
				updatedAt: new Date(),
			})
			.onConflictDoNothing()
			.returning();

		if (created) {
			return this.map(created);
		}

		const [existing] = await db
			.select()
			.from(contentAiSettings)
			.where(eq(contentAiSettings.id, SETTINGS_ID));

		if (!existing) {
			throw new Error("Failed to create AI settings");
		}

		return this.map(existing);
	}

	async update(
		input: UpdateContentAiSettingsInput,
	): Promise<ContentAiSettings> {
		await this.get();

		const [updated] = await db
			.update(contentAiSettings)
			.set({
				provider: input.provider,
				openaiApiKey: input.openaiApiKey?.trim() ?? "",
				openaiBaseUrl: input.openaiBaseUrl?.trim() ?? "",
				openaiModel: input.openaiModel.trim(),
				geminiApiKey: input.geminiApiKey?.trim() ?? "",
				geminiModel: input.geminiModel.trim(),
				openrouterApiKey: input.openrouterApiKey?.trim() ?? "",
				openrouterModel: input.openrouterModel.trim(),
				codexModel: input.codexModel.trim(),
				whisperProvider: input.whisperProvider,
				whisperModel: input.whisperModel,
				whisperChunkingEnabled: input.whisperChunkingEnabled,
				whisperChunkMinutes: input.whisperChunkMinutes,
				subtitleColor: normalizeSubtitleColor(input.subtitleColor),
				subtitleHighlightColor: normalizeSubtitleHighlightColor(
					input.subtitleHighlightColor,
				),
				subtitleFontFamily: input.subtitleFontFamily,
				updatedAt: new Date(),
			})
			.where(eq(contentAiSettings.id, SETTINGS_ID))
			.returning();

		if (!updated) {
			throw new Error("AI settings not found");
		}

		return this.map(updated);
	}

	private map(row: typeof contentAiSettings.$inferSelect): ContentAiSettings {
		return {
			id: row.id,
			provider: row.provider as ContentAiSettings["provider"],
			openaiApiKey: row.openaiApiKey,
			openaiBaseUrl: row.openaiBaseUrl,
			openaiModel: row.openaiModel,
			geminiApiKey: row.geminiApiKey,
			geminiModel: row.geminiModel,
			openrouterApiKey: row.openrouterApiKey,
			openrouterModel: row.openrouterModel,
			codexModel: row.codexModel,
			whisperProvider: normalizeWhisperProvider(row.whisperProvider),
			whisperModel: normalizeWhisperModel(row.whisperModel),
			whisperChunkingEnabled: row.whisperChunkingEnabled,
			whisperChunkMinutes:
				row.whisperChunkMinutes || DEFAULT_WHISPER_CHUNK_MINUTES,
			subtitleColor: normalizeSubtitleColor(row.subtitleColor),
			subtitleHighlightColor: normalizeSubtitleHighlightColor(
				row.subtitleHighlightColor,
			),
			subtitleFontFamily: normalizeSubtitleFontFamily(row.subtitleFontFamily),
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
		};
	}
}

export const contentAiSettingsRepository = new ContentAiSettingsRepository();
