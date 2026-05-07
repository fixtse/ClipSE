export const CONTENT_AI_PROVIDERS = ["openai", "gemini", "openrouter"] as const;

export type ContentAiProvider = (typeof CONTENT_AI_PROVIDERS)[number];

export interface ContentAiModelOption {
	readonly value: string;
	readonly label: string;
}
