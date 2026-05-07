import { eq } from "drizzle-orm";
import { env } from "~/env";
import { db } from "~/server/db";
import { contentAiSettings } from "~/server/db/schema";
import type { ContentAiSettingsRepositoryInterface } from "../domain/content-ai-settings.repository.interface";
import type {
	ContentAiSettings,
	UpdateContentAiSettingsInput,
} from "../domain/content-ai-settings.valueobject";
import { WHISPER_MODELS } from "../domain/content-ai-settings.valueobject";

const SETTINGS_ID = 1;

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
				openaiApiKey: env.OPENAI_API_KEY,
				openaiBaseUrl: env.OPENAI_BASE_URL,
				openaiModel: env.OPENAI_MODEL,
				geminiApiKey: "",
				geminiModel: "gemini-2.5-flash",
				openrouterApiKey: "",
				openrouterModel: "",
				whisperModel: normalizeWhisperModel(env.WHISPER_MODEL),
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
				whisperModel: input.whisperModel,
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
			whisperModel: normalizeWhisperModel(row.whisperModel),
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
		};
	}
}

export const contentAiSettingsRepository = new ContentAiSettingsRepository();
