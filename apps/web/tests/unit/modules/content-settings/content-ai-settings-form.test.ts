import { describe, expect, it } from "vitest";
import {
	getAudioLanguageOptions,
	getProviderModelValue,
	getWhisperModelOptions,
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
		]);
	});

	it("selects the configured model value for the active provider", () => {
		const input = {
			openaiModel: "gpt-5.1",
			geminiModel: "gemini-3-pro",
			openrouterModel: "openrouter/model",
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
	});
});
