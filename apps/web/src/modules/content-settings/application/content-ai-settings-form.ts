import type {
	ContentAiModelOption,
	ContentAiProvider,
} from "../domain/content-ai-models";
import {
	type ContentAiSettings,
	WHISPER_MODELS,
} from "../domain/content-ai-settings.valueobject";

export type WhisperModel = ContentAiSettings["whisperModel"];

export function getAudioLanguageOptions(
	translate: (key: string) => string,
): ReadonlyArray<{ value: string; label: string }> {
	return [
		{ value: "auto", label: translate("languages.auto") },
		{ value: "en", label: translate("languages.en") },
		{ value: "es", label: translate("languages.es") },
		{ value: "pt", label: translate("languages.pt") },
		{ value: "fr", label: translate("languages.fr") },
		{ value: "de", label: translate("languages.de") },
		{ value: "it", label: translate("languages.it") },
		{ value: "ja", label: translate("languages.ja") },
		{ value: "ko", label: translate("languages.ko") },
		{ value: "zh", label: translate("languages.zh") },
	];
}

export function getWhisperModelOptions(
	translate: (key: string) => string,
): ReadonlyArray<{
	value: WhisperModel;
	label: string;
	description: string;
}> {
	return WHISPER_MODELS.map((model) => ({
		value: model,
		label: translate(`workspace.settings.whisperModels.${model}.label`),
		description: translate(
			`workspace.settings.whisperModels.${model}.description`,
		),
	}));
}

export function getProviderModelValue(input: {
	provider: ContentAiProvider;
	openaiModel: string;
	geminiModel: string;
	openrouterModel: string;
	codexModel: string;
}): string {
	switch (input.provider) {
		case "gemini":
			return input.geminiModel;
		case "openrouter":
			return input.openrouterModel;
		case "codex":
			return input.codexModel;
		default:
			return input.openaiModel;
	}
}

export type { ContentAiModelOption, ContentAiProvider, ContentAiSettings };
