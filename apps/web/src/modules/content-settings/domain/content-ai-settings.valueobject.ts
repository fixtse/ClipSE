import { z } from "zod";
import { CONTENT_AI_PROVIDERS } from "./content-ai-models";

export const WHISPER_MODELS = ["medium", "large-v3-turbo"] as const;

export const ContentAiSettingsSchema = z.object({
	id: z.number().int().positive(),
	provider: z.enum(CONTENT_AI_PROVIDERS),
	openaiApiKey: z.string(),
	openaiBaseUrl: z.string(),
	openaiModel: z.string().min(1).max(180),
	geminiApiKey: z.string(),
	geminiModel: z.string().min(1).max(180),
	openrouterApiKey: z.string(),
	openrouterModel: z.string().max(180),
	whisperModel: z.enum(WHISPER_MODELS),
	createdAt: z.date(),
	updatedAt: z.date(),
});

export type ContentAiSettings = z.infer<typeof ContentAiSettingsSchema>;

export const UpdateContentAiSettingsSchema = z.object({
	provider: z.enum(CONTENT_AI_PROVIDERS),
	openaiApiKey: z.string().optional(),
	openaiBaseUrl: z.string().optional(),
	openaiModel: z.string().min(1).max(180),
	geminiApiKey: z.string().optional(),
	geminiModel: z.string().min(1).max(180),
	openrouterApiKey: z.string().optional(),
	openrouterModel: z.string().max(180),
	whisperModel: z.enum(WHISPER_MODELS).default("medium"),
});

export type UpdateContentAiSettingsInput = z.infer<
	typeof UpdateContentAiSettingsSchema
>;
