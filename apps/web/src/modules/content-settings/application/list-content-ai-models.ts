import type {
	ContentAiModelOption,
	ContentAiProvider,
} from "../domain/content-ai-models";
import type { ContentAiSettingsRepositoryInterface } from "../domain/content-ai-settings.repository.interface";
import { listCodexModels } from "../infrastructure/codex-cli";

interface OpenAiModelListResponse {
	readonly data?: Array<{
		readonly id?: string;
	}>;
}

interface GeminiModelListResponse {
	readonly models?: Array<{
		readonly name?: string;
		readonly displayName?: string;
		readonly supportedGenerationMethods?: string[];
	}>;
}

interface OpenRouterModelListResponse {
	readonly data?: Array<{
		readonly id?: string;
		readonly name?: string;
	}>;
}

function byLabel(
	left: ContentAiModelOption,
	right: ContentAiModelOption,
): number {
	return left.label.localeCompare(right.label);
}

function trimGeminiModelName(name: string): string {
	return name.replace(/^models\//, "");
}

async function fetchJson<T>(
	url: string,
	init: RequestInit,
	errorContext: string,
): Promise<T> {
	const response = await fetch(url, {
		...init,
		headers: {
			Accept: "application/json",
			...init.headers,
		},
	});

	if (!response.ok) {
		throw new Error(
			`${errorContext}: ${response.status} ${response.statusText}`,
		);
	}

	return (await response.json()) as T;
}

export async function listContentAiModels(
	repository: ContentAiSettingsRepositoryInterface,
	provider: ContentAiProvider,
): Promise<ContentAiModelOption[]> {
	const settings = await repository.get();

	if (provider === "codex") {
		return listCodexModels();
	}

	if (provider === "gemini") {
		if (!settings.geminiApiKey) {
			return [];
		}

		const payload = await fetchJson<GeminiModelListResponse>(
			`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(settings.geminiApiKey)}`,
			{ method: "GET" },
			"Failed to load Gemini models",
		);

		return (payload.models ?? [])
			.filter((model) =>
				model.supportedGenerationMethods?.includes("generateContent"),
			)
			.map((model) => {
				const value = trimGeminiModelName(model.name ?? "");
				return {
					value,
					label: model.displayName || value,
				};
			})
			.filter((model) => model.value.length > 0)
			.sort(byLabel);
	}

	if (provider === "openrouter") {
		if (!settings.openrouterApiKey) {
			return [];
		}

		const payload = await fetchJson<OpenRouterModelListResponse>(
			"https://openrouter.ai/api/v1/models",
			{
				method: "GET",
				headers: {
					Authorization: `Bearer ${settings.openrouterApiKey}`,
				},
			},
			"Failed to load OpenRouter models",
		);

		return (payload.data ?? [])
			.map((model) => ({
				value: model.id ?? "",
				label: model.name || model.id || "",
			}))
			.filter((model) => model.value.length > 0)
			.sort(byLabel);
	}

	if (!settings.openaiApiKey) {
		return [];
	}

	const baseUrl = settings.openaiBaseUrl || "https://api.openai.com/v1";
	const payload = await fetchJson<OpenAiModelListResponse>(
		`${baseUrl.replace(/\/$/, "")}/models`,
		{
			method: "GET",
			headers: {
				Authorization: `Bearer ${settings.openaiApiKey}`,
			},
		},
		"Failed to load OpenAI models",
	);

	return (payload.data ?? [])
		.map((model) => ({
			value: model.id ?? "",
			label: model.id ?? "",
		}))
		.filter((model) => model.value.length > 0)
		.sort(byLabel);
}
