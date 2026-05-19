import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { transcribeWithWhisperService } from "~/server/lib/clipse-whisper";

const { execFileMock, getSettingsMock } = vi.hoisted(() => ({
	execFileMock: vi.fn(),
	getSettingsMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
	execFile: execFileMock,
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
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("sends and returns the Whisper model selected in settings", async () => {
		getSettingsMock.mockResolvedValueOnce({
			whisperModel: "large-v3-turbo",
			whisperProvider: "faster-whisper",
			whisperChunkingEnabled: false,
			whisperChunkMinutes: 20,
		});
		execFileMock.mockImplementation(
			(
				command: string,
				args: string[],
				callback: (
					error: Error | null,
					stdout?: string,
					stderr?: string,
				) => void,
			) => {
				if (command === "ffmpeg") {
					void writeFile(args.at(-1) as string, Buffer.from("chunk")).then(
						() => callback(null, "", ""),
						(error: Error) => callback(error),
					);
					return;
				}

				callback(null, "1\n", "");
			},
		);
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			const body = init?.body as FormData;
			expect(body.get("model")).toBe("large-v3-turbo");
			expect(body.get("provider")).toBe("faster-whisper");
			expect(body.get("unload_after")).toBe("true");

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

		const workspace = await mkdtemp(join(tmpdir(), "clipse-whisper-test-"));
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

	it("overlaps chunks and merges absolute segment and word timestamps", async () => {
		vi.stubEnv("CLIPSE_WHISPER_CHUNK_OVERLAP_SECONDS", "5");
		getSettingsMock.mockResolvedValueOnce({
			whisperModel: "medium",
			whisperProvider: "faster-whisper",
			whisperChunkingEnabled: true,
			whisperChunkMinutes: 1,
		});
		execFileMock.mockImplementation(
			(
				command: string,
				args: string[],
				callback: (
					error: Error | null,
					stdout?: string,
					stderr?: string,
				) => void,
			) => {
				if (command === "ffmpeg") {
					void writeFile(args.at(-1) as string, Buffer.from("chunk")).then(
						() => callback(null, "", ""),
						(error: Error) => callback(error),
					);
					return;
				}

				const inputPath = args.at(-1) as string;
				callback(null, inputPath.endsWith("audio.wav") ? "70\n" : "60\n", "");
			},
		);
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						text: "hello",
						language: "en",
						duration: 10,
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
				),
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						text: "world",
						language: "en",
						duration: 4,
						segments: [
							{
								start: 5.2,
								end: 6.5,
								text: "world",
								words: [
									{ start: 4.5, end: 4.8, text: "duplicate" },
									{ start: 5.3, end: 5.8, text: "world" },
								],
							},
						],
					}),
					{ status: 200 },
				),
			);
		vi.stubGlobal("fetch", fetchMock);

		const workspace = await mkdtemp(join(tmpdir(), "clipse-whisper-test-"));
		const audioFilePath = join(workspace, "audio.wav");
		await writeFile(audioFilePath, Buffer.from("wav"));

		await expect(
			transcribeWithWhisperService({ audioFilePath }),
		).resolves.toMatchObject({
			text: "hello world",
			durationSeconds: 70,
			segments: [
				{
					start: 0,
					end: 1,
					words: [{ start: 0.1, end: 0.4, text: "hello" }],
				},
				{
					start: 60.2,
					end: 61.5,
					words: [{ start: 60.3, end: 60.8, text: "world" }],
				},
			],
		});
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(
			fetchMock.mock.calls.map(([, init]) =>
				(init?.body as FormData).get("unload_after"),
			),
		).toEqual(["false", "true"]);
	});
});
