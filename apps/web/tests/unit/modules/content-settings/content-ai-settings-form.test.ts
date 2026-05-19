import { describe, expect, it } from "vitest";
import {
	getAudioLanguageOptions,
	getProviderModelValue,
	getWhisperModelOptions,
	getWhisperProviderOptions,
} from "~/modules/content-settings/application/content-ai-settings-form";

describe("content AI settings form helpers", () => {
	const translate = (key: string): string => `translated:${key}`;

	it("builds audio language options with translated labels", () => {
		const options = getAudioLanguageOptions(translate);

		expect(options[0]).toEqual({
			value: "auto",
			label: "translated:languages.auto",
		});
		expect(options.map((option) => option.value)).toContain("en");
		expect(options.map((option) => option.value)).toContain("zh");
	});

	it("builds whisper model options from the supported model list", () => {
		expect(getWhisperModelOptions(translate)).toEqual([
			{
				value: "medium",
				label: "translated:workspace.settings.whisperModels.medium.label",
				description:
					"translated:workspace.settings.whisperModels.medium.description",
			},
			{
				value: "large-v3-turbo",
				label:
					"translated:workspace.settings.whisperModels.large-v3-turbo.label",
				description:
					"translated:workspace.settings.whisperModels.large-v3-turbo.description",
			},
			{
				value: "whisper-tiny",
				label: "translated:workspace.settings.whisperModels.whisper-tiny.label",
				description:
					"translated:workspace.settings.whisperModels.whisper-tiny.description",
			},
			{
				value: "whisper-base",
				label: "translated:workspace.settings.whisperModels.whisper-base.label",
				description:
					"translated:workspace.settings.whisperModels.whisper-base.description",
			},
			{
				value: "whisper-small",
				label:
					"translated:workspace.settings.whisperModels.whisper-small.label",
				description:
					"translated:workspace.settings.whisperModels.whisper-small.description",
			},
		]);
	});

	it("builds whisper provider options from the supported provider list", () => {
		expect(getWhisperProviderOptions(translate)).toEqual([
			{
				value: "faster-whisper",
				label:
					"translated:workspace.settings.whisperProviders.faster-whisper.label",
				description:
					"translated:workspace.settings.whisperProviders.faster-whisper.description",
			},
			{
				value: "hailo",
				label: "translated:workspace.settings.whisperProviders.hailo.label",
				description:
					"translated:workspace.settings.whisperProviders.hailo.description",
			},
		]);
	});

	it("selects the configured model value for the active provider", () => {
		const input = {
			openaiModel: "gpt-5.1",
			geminiModel: "gemini-3-pro",
			openrouterModel: "openrouter/model",
			codexModel: "gpt-5.3-codex",
		};

		expect(getProviderModelValue({ ...input, provider: "openai" })).toBe(
			"gpt-5.1",
		);
		expect(getProviderModelValue({ ...input, provider: "gemini" })).toBe(
			"gemini-3-pro",
		);
		expect(getProviderModelValue({ ...input, provider: "openrouter" })).toBe(
			"openrouter/model",
		);
		expect(getProviderModelValue({ ...input, provider: "codex" })).toBe(
			"gpt-5.3-codex",
		);
	});
});
