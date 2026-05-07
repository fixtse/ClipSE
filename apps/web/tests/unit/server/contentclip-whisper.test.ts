import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { transcribeWithWhisperService } from "~/server/lib/contentclip-whisper";

const { getSettingsMock } = vi.hoisted(() => ({
	getSettingsMock: vi.fn(),
}));

vi.mock(
	"~/modules/content-settings/infrastructure/content-ai-settings.repository",
	() => ({
		contentAiSettingsRepository: {
			get: getSettingsMock,
		},
	}),
);

vi.mock("~/env", () => ({
	env: {
		WHISPER_SERVICE_URL: "http://whisper.test",
	},
}));

describe("transcribeWithWhisperService", () => {
	it("sends and returns the Whisper model selected in settings", async () => {
		getSettingsMock.mockResolvedValueOnce({
			whisperModel: "large-v3-turbo",
		});
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			const body = init?.body as FormData;
			expect(body.get("model")).toBe("large-v3-turbo");

			return new Response(
				JSON.stringify({
					text: "hello",
					language: "en",
					duration: 1,
					segments: [
						{
							start: 0,
							end: 1,
							text: "hello",
							words: [{ start: 0.1, end: 0.4, text: "hello" }],
						},
					],
				}),
				{ status: 200 },
			);
		});
		vi.stubGlobal("fetch", fetchMock);

		const workspace = await mkdtemp(
			join(tmpdir(), "contentclip-whisper-test-"),
		);
		const audioFilePath = join(workspace, "audio.wav");
		await writeFile(audioFilePath, Buffer.from("wav"));

		await expect(
			transcribeWithWhisperService({ audioFilePath }),
		).resolves.toMatchObject({
			model: "large-v3-turbo",
			segments: [
				{
					words: [{ start: 0.1, end: 0.4, text: "hello" }],
				},
			],
		});
		expect(fetchMock).toHaveBeenCalledWith(
			"http://whisper.test/transcribe",
			expect.objectContaining({ method: "POST" }),
		);
	});
});
