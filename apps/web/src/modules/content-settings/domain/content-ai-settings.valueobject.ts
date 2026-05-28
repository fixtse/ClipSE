import { z } from "zod";
import { CONTENT_AI_PROVIDERS } from "./content-ai-models";

export const WHISPER_MODELS = [
	"medium",
	"large-v3-turbo",
	"whisper-tiny",
	"whisper-base",
	"whisper-small",
] as const;
export const WHISPER_PROVIDERS = ["faster-whisper", "hailo"] as const;
export const SUBTITLE_FONT_FAMILIES = [
	"Arial",
	"Helvetica",
	"Impact",
	"Verdana",
	"Georgia",
	"Times New Roman",
	"Courier New",
] as const;

const HexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const SubtitleFontFamilySchema = z.string().trim().min(1).max(80);

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
	codexModel: z.string().min(1).max(180),
	whisperProvider: z.enum(WHISPER_PROVIDERS),
	whisperModel: z.enum(WHISPER_MODELS),
	whisperChunkingEnabled: z.boolean(),
	whisperChunkMinutes: z.number().int().min(1).max(120),
	subtitleColor: HexColorSchema,
	subtitleHighlightColor: HexColorSchema,
	subtitleFontFamily: SubtitleFontFamilySchema,
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
	codexModel: z.string().min(1).max(180),
	whisperProvider: z.enum(WHISPER_PROVIDERS).default("faster-whisper"),
	whisperModel: z.enum(WHISPER_MODELS).default("medium"),
	whisperChunkingEnabled: z.boolean().default(false),
	whisperChunkMinutes: z.number().int().min(1).max(120).default(20),
	subtitleColor: HexColorSchema.default("#ffffff"),
	subtitleHighlightColor: HexColorSchema.default("#ffe45c"),
	subtitleFontFamily: SubtitleFontFamilySchema.default("Arial"),
});

export type UpdateContentAiSettingsInput = z.infer<
	typeof UpdateContentAiSettingsSchema
>;
