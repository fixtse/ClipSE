export const CONTENT_AI_PROVIDERS = [
	"openai",
	"gemini",
	"openrouter",
	"codex",
] as const;

export type ContentAiProvider = (typeof CONTENT_AI_PROVIDERS)[number];

export interface ContentAiModelOption {
	readonly value: string;
	readonly label: string;
}
