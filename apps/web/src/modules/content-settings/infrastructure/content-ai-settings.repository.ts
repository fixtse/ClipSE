import { eq } from "drizzle-orm";
import { db } from "~/server/db";
import { contentAiSettings } from "~/server/db/schema";
import type { ContentAiSettingsRepositoryInterface } from "../domain/content-ai-settings.repository.interface";
import type {
	ContentAiSettings,
	UpdateContentAiSettingsInput,
} from "../domain/content-ai-settings.valueobject";
import { WHISPER_MODELS } from "../domain/content-ai-settings.valueobject";

const SETTINGS_ID = 1;
const DEFAULT_WHISPER_CHUNK_MINUTES = 20;

function normalizeWhisperModel(
	model: string,
): ContentAiSettings["whisperModel"] {
	return WHISPER_MODELS.includes(model as ContentAiSettings["whisperModel"])
		? (model as ContentAiSettings["whisperModel"])
		: "medium";
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
				whisperModel: "medium",
				whisperChunkingEnabled: false,
				whisperChunkMinutes: DEFAULT_WHISPER_CHUNK_MINUTES,
				createdAt: new Date(),
				updatedAt: new Date(),
			})
			.returning();

		if (!created) {
			throw new Error("Failed to create AI settings");
		}

		return this.map(created);
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
				whisperModel: input.whisperModel,
				whisperChunkingEnabled: input.whisperChunkingEnabled,
				whisperChunkMinutes: input.whisperChunkMinutes,
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
			whisperModel: normalizeWhisperModel(row.whisperModel),
			whisperChunkingEnabled: row.whisperChunkingEnabled,
			whisperChunkMinutes:
				row.whisperChunkMinutes || DEFAULT_WHISPER_CHUNK_MINUTES,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
		};
	}
}

export const contentAiSettingsRepository = new ContentAiSettingsRepository();
