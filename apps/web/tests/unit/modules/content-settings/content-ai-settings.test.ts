import { describe, expect, it, vi } from "vitest";
import { getContentAiSettings } from "~/modules/content-settings/application/get-content-ai-settings";
import { listContentAiModels } from "~/modules/content-settings/application/list-content-ai-models";
import { updateContentAiSettings } from "~/modules/content-settings/application/update-content-ai-settings";
import { ContentAiSettingsMother } from "../../../mothers/domain-mothers";
import { ContentAiSettingsRepositoryMother } from "../../../mothers/repository-mothers";

describe("content AI settings use cases", () => {
	it("loads and updates settings through the repository", async () => {
		const settings = ContentAiSettingsMother.create();
		const repository = ContentAiSettingsRepositoryMother.create({
			get: vi.fn(async () => settings),
		});

		await expect(getContentAiSettings(repository)).resolves.toEqual(settings);
		await expect(
			updateContentAiSettings(repository, {
				provider: "gemini",
				openaiModel: "gpt-5.1",
				geminiModel: "gemini-3-pro",
				openrouterModel: "",
				whisperModel: "large-v3-turbo",
			}),
		).resolves.toMatchObject({
			provider: "gemini",
			whisperModel: "large-v3-turbo",
		});
		expect(repository.update).toHaveBeenCalledWith({
			provider: "gemini",
			openaiModel: "gpt-5.1",
			geminiModel: "gemini-3-pro",
			openrouterModel: "",
			whisperModel: "large-v3-turbo",
		});
	});

	it("rejects invalid updates before calling the repository", async () => {
		const repository = ContentAiSettingsRepositoryMother.create();

		await expect(
			updateContentAiSettings(repository, {
				provider: "openai",
				openaiModel: "",
				geminiModel: "gemini-3-pro",
				openrouterModel: "",
				whisperModel: "medium",
			}),
		).rejects.toThrow();
		expect(repository.update).not.toHaveBeenCalled();
	});

	it("returns no models when provider credentials are missing", async () => {
		const repository = ContentAiSettingsRepositoryMother.create({
			get: vi.fn(async () =>
				ContentAiSettingsMother.create({
					openaiApiKey: "",
					geminiApiKey: "",
					openrouterApiKey: "",
				}),
			),
		});

		await expect(listContentAiModels(repository, "openai")).resolves.toEqual(
			[],
		);
		await expect(listContentAiModels(repository, "gemini")).resolves.toEqual(
			[],
		);
		await expect(
			listContentAiModels(repository, "openrouter"),
		).resolves.toEqual([]);
	});

	it("fetches and sorts provider model lists", async () => {
		const fetchMock = vi.fn(async (url: string) => ({
			ok: true,
			json: async () => {
				if (url.includes("generativelanguage")) {
					return {
						models: [
							{
								name: "models/embedding-only",
								displayName: "Embedding only",
								supportedGenerationMethods: ["embedContent"],
							},
							{
								displayName: "Nameless Gemini",
								supportedGenerationMethods: ["generateContent"],
							},
							{
								name: "models/gemini-z",
								displayName: "Z Gemini",
								supportedGenerationMethods: ["generateContent"],
							},
							{
								name: "models/gemini-a",
								displayName: "A Gemini",
								supportedGenerationMethods: ["generateContent"],
							},
						],
					};
				}
				if (url.includes("openrouter")) {
					return {
						data: [
							{ name: "Missing id" },
							{ id: "z/model", name: "Z Model" },
							{ id: "a/model", name: "A Model" },
						],
					};
				}
				return { data: [{ id: "" }, { id: "z-openai" }, { id: "a-openai" }] };
			},
			status: 200,
			statusText: "OK",
		})) as unknown as typeof fetch;
		vi.stubGlobal("fetch", fetchMock);
		const repository = ContentAiSettingsRepositoryMother.create({
			get: vi.fn(async () =>
				ContentAiSettingsMother.create({
					openaiBaseUrl: "https://openai.proxy/v1/",
				}),
			),
		});

		await expect(listContentAiModels(repository, "gemini")).resolves.toEqual([
			{ value: "gemini-a", label: "A Gemini" },
			{ value: "gemini-z", label: "Z Gemini" },
		]);
		await expect(
			listContentAiModels(repository, "openrouter"),
		).resolves.toEqual([
			{ value: "a/model", label: "A Model" },
			{ value: "z/model", label: "Z Model" },
		]);
		await expect(listContentAiModels(repository, "openai")).resolves.toEqual([
			{ value: "a-openai", label: "a-openai" },
			{ value: "z-openai", label: "z-openai" },
		]);
		expect(fetchMock).toHaveBeenCalledWith(
			"https://openai.proxy/v1/models",
			expect.objectContaining({
				headers: expect.objectContaining({
					Authorization: "Bearer openai-key",
				}),
			}),
		);
	});

	it("raises contextual errors for failed provider fetches", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: false,
				status: 503,
				statusText: "Unavailable",
				json: async () => ({}),
			})),
		);

		await expect(
			listContentAiModels(ContentAiSettingsRepositoryMother.create(), "openai"),
		).rejects.toThrow("Failed to load OpenAI models: 503 Unavailable");
	});
});
