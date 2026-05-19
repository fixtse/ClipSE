import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { z } from "zod";
import { env } from "~/env";
import type { ContentAiSettings } from "~/modules/content-settings/domain/content-ai-settings.valueobject";
import { contentAiSettingsRepository } from "~/modules/content-settings/infrastructure/content-ai-settings.repository";
import {
	type ContentTranscriptionSegment,
	ContentTranscriptionSegmentSchema,
} from "~/modules/content-transcriptions/domain/content-transcription.valueobject";

const whisperResponseSchema = z.object({
	text: z.string(),
	language: z.string(),
	duration: z.number().optional(),
	segments: z.array(ContentTranscriptionSegmentSchema),
});

const DEFAULT_WHISPER_CHUNK_SECONDS = 20 * 60;
const DEFAULT_WHISPER_CHUNK_OVERLAP_SECONDS = 5;

export interface WhisperTranscriptionResult {
	text: string;
	language: string;
	model: ContentAiSettings["whisperModel"];
	segments: ContentTranscriptionSegment[];
	durationSeconds?: number;
}

export async function transcribeWithWhisperService(input: {
	audioFilePath: string;
	languageHint?: string | null;
}): Promise<WhisperTranscriptionResult> {
	const aiSettings = await contentAiSettingsRepository.get();
	const model = aiSettings.whisperModel;
	const chunkDurationSeconds = getWhisperChunkSeconds(
		aiSettings.whisperChunkMinutes,
	);
	const workspace = await mkdtemp(join(tmpdir(), "clipse-whisper-chunks-"));

	try {
		const chunkPaths = await splitAudioIntoChunks({
			audioFilePath: input.audioFilePath,
			outputDirectory: workspace,
			chunkDurationSeconds,
			enabled: aiSettings.whisperChunkingEnabled,
		});
		const sourceDurationSeconds =
			chunkPaths.length > 0
				? await getAudioDurationSeconds(input.audioFilePath)
				: undefined;
		const chunks =
			chunkPaths.length > 0
				? chunkPaths
				: [
						{
							filePath: input.audioFilePath,
							offsetSeconds: 0,
							trimBeforeSeconds: 0,
						},
					];
		const transcriptions: Array<{
			offsetSeconds: number;
			trimBeforeSeconds: number;
			result: z.infer<typeof whisperResponseSchema>;
		}> = [];

		for (const [index, chunk] of chunks.entries()) {
			const isLastChunk = index === chunks.length - 1;

			try {
				const result = await transcribeAudioFile({
					audioFilePath: chunk.filePath,
					model,
					languageHint: input.languageHint,
					unloadAfter: isLastChunk,
				});
				transcriptions.push({
					offsetSeconds: chunk.offsetSeconds,
					trimBeforeSeconds: chunk.trimBeforeSeconds,
					result,
				});
			} catch (error) {
				if (!(error instanceof WhisperNoSpeechError)) {
					throw error;
				}
			}
		}

		return mergeChunkTranscriptions({
			model,
			sourceDurationSeconds,
			transcriptions,
		});
	} finally {
		await rm(workspace, { force: true, recursive: true });
	}
}

async function transcribeAudioFile(input: {
	audioFilePath: string;
	model: ContentAiSettings["whisperModel"];
	languageHint?: string | null;
	unloadAfter: boolean;
}): Promise<z.infer<typeof whisperResponseSchema>> {
	const formData = new FormData();
	const fileBuffer = await readFile(input.audioFilePath);
	const fileName = basename(input.audioFilePath);

	formData.set(
		"file",
		new File([fileBuffer], fileName, {
			type: "audio/wav",
		}),
	);
	formData.set("model", input.model);
	formData.set("unload_after", input.unloadAfter ? "true" : "false");

	if (input.languageHint && input.languageHint !== "auto") {
		formData.set("language", input.languageHint);
	}

	const response = await fetch(`${env.WHISPER_SERVICE_URL}/transcribe`, {
		method: "POST",
		body: formData,
	});

	if (!response.ok) {
		const errorBody = await response.text();
		const errorDetail = parseWhisperErrorDetail(errorBody) ?? errorBody;
		if (response.status === 422 && errorDetail.includes("No speech detected")) {
			throw new WhisperNoSpeechError();
		}
		throw new Error(
			`Whisper service failed with ${response.status}: ${errorDetail}`,
		);
	}

	return whisperResponseSchema.parse(await response.json());
}

async function splitAudioIntoChunks(input: {
	audioFilePath: string;
	outputDirectory: string;
	chunkDurationSeconds: number;
	enabled: boolean;
}): Promise<
	Array<{
		filePath: string;
		offsetSeconds: number;
		trimBeforeSeconds: number;
	}>
> {
	if (!input.enabled) {
		return [];
	}

	const sourceDurationSeconds = await getAudioDurationSeconds(
		input.audioFilePath,
	);
	if (sourceDurationSeconds <= input.chunkDurationSeconds) {
		return [];
	}

	const overlapSeconds = Math.min(
		readWhisperChunkOverlapSeconds(),
		input.chunkDurationSeconds / 2,
	);
	const chunkStrideSeconds = input.chunkDurationSeconds - overlapSeconds;
	const chunkItems: Array<{
		filePath: string;
		offsetSeconds: number;
		trimBeforeSeconds: number;
	}> = [];
	let chunkIndex = 0;
	let chunkOffsetSeconds = 0;

	while (
		chunkOffsetSeconds < sourceDurationSeconds &&
		(chunkIndex === 0 ||
			chunkOffsetSeconds + overlapSeconds < sourceDurationSeconds)
	) {
		const chunkPath = join(
			input.outputDirectory,
			`chunk-${chunkIndex.toString().padStart(5, "0")}.wav`,
		);
		await execFileText("ffmpeg", [
			"-y",
			"-ss",
			chunkOffsetSeconds.toString(),
			"-i",
			input.audioFilePath,
			"-t",
			input.chunkDurationSeconds.toString(),
			"-vn",
			"-ac",
			"1",
			"-ar",
			"16000",
			"-c:a",
			"pcm_s16le",
			chunkPath,
		]);

		chunkItems.push({
			filePath: chunkPath,
			offsetSeconds: roundTimestamp(chunkOffsetSeconds),
			trimBeforeSeconds: chunkIndex === 0 ? 0 : overlapSeconds,
		});

		chunkIndex += 1;
		chunkOffsetSeconds += chunkStrideSeconds;
	}

	const entries = await readdir(input.outputDirectory);
	return entries
		.filter((entry) => /^chunk-\d+\.wav$/.test(entry))
		.sort()
		.map((entry) => {
			const index = Number.parseInt(entry.match(/\d+/)?.[0] ?? "", 10);
			return chunkItems[index];
		})
		.filter(
			(
				chunk,
			): chunk is {
				filePath: string;
				offsetSeconds: number;
				trimBeforeSeconds: number;
			} => Boolean(chunk),
		);
}

async function getAudioDurationSeconds(audioFilePath: string): Promise<number> {
	const stdout = await execFileText("ffprobe", [
		"-v",
		"error",
		"-show_entries",
		"format=duration",
		"-of",
		"default=noprint_wrappers=1:nokey=1",
		audioFilePath,
	]);
	const duration = Number.parseFloat(stdout.trim());
	return Number.isFinite(duration) && duration > 0 ? duration : 0;
}

async function execFileText(command: string, args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		execFile(command, args, (error, stdout) => {
			if (error) {
				reject(error);
				return;
			}

			resolve(stdout);
		});
	});
}

function mergeChunkTranscriptions(input: {
	model: ContentAiSettings["whisperModel"];
	sourceDurationSeconds?: number;
	transcriptions: ReadonlyArray<{
		offsetSeconds: number;
		trimBeforeSeconds: number;
		result: z.infer<typeof whisperResponseSchema>;
	}>;
}): WhisperTranscriptionResult {
	const segments = input.transcriptions.flatMap((chunk) =>
		chunk.result.segments
			.map((segment) =>
				offsetSegmentTimestamps({
					segment,
					offsetSeconds: chunk.offsetSeconds,
					trimBeforeSeconds: chunk.trimBeforeSeconds,
				}),
			)
			.filter((segment): segment is ContentTranscriptionSegment =>
				Boolean(segment),
			),
	);
	const text = segments
		.map((segment) => segment.text.trim())
		.filter(Boolean)
		.join(" ")
		.trim();
	const durationSeconds = input.transcriptions.reduce(
		(duration, chunk) =>
			Math.max(duration, chunk.offsetSeconds + (chunk.result.duration ?? 0)),
		0,
	);
	const resolvedDurationSeconds =
		input.sourceDurationSeconds ?? durationSeconds;

	if (!segments.length || !text) {
		throw new Error("No speech detected");
	}

	return {
		text,
		language:
			input.transcriptions.find((chunk) => chunk.result.language !== "unknown")
				?.result.language ??
			input.transcriptions[0]?.result.language ??
			"unknown",
		model: input.model,
		segments,
		durationSeconds:
			resolvedDurationSeconds > 0
				? roundTimestamp(resolvedDurationSeconds)
				: undefined,
	};
}

function offsetSegmentTimestamps(input: {
	segment: ContentTranscriptionSegment;
	offsetSeconds: number;
	trimBeforeSeconds: number;
}): ContentTranscriptionSegment | null {
	const minimumStartSeconds = input.offsetSeconds + input.trimBeforeSeconds;
	const start = offsetTimestamp(input.segment.start, input.offsetSeconds);
	const end = offsetTimestamp(input.segment.end, input.offsetSeconds);
	const words = input.segment.words
		?.map((word) => ({
			...word,
			start: offsetTimestamp(word.start, input.offsetSeconds),
			end: offsetTimestamp(word.end, input.offsetSeconds),
		}))
		.filter((word) => word.end > minimumStartSeconds);

	if (words && words.length === 0) {
		return null;
	}

	if (!words && end <= minimumStartSeconds) {
		return null;
	}

	return {
		...input.segment,
		start: roundTimestamp(Math.max(start, minimumStartSeconds)),
		end,
		text: words?.map((word) => word.text).join(" ") ?? input.segment.text,
		words,
	};
}

function offsetTimestamp(seconds: number, offsetSeconds: number): number {
	return roundTimestamp(seconds + offsetSeconds);
}

function roundTimestamp(seconds: number): number {
	return Number(seconds.toFixed(3));
}

function getWhisperChunkSeconds(chunkMinutes: number): number {
	return Number.isFinite(chunkMinutes) && chunkMinutes > 0
		? chunkMinutes * 60
		: DEFAULT_WHISPER_CHUNK_SECONDS;
}

function readWhisperChunkOverlapSeconds(): number {
	const configured = Number.parseInt(
		process.env.CLIPSE_WHISPER_CHUNK_OVERLAP_SECONDS ?? "",
		10,
	);
	return Number.isFinite(configured) && configured >= 0
		? configured
		: DEFAULT_WHISPER_CHUNK_OVERLAP_SECONDS;
}

class WhisperNoSpeechError extends Error {
	constructor() {
		super("No speech detected");
		this.name = "WhisperNoSpeechError";
	}
}

function parseWhisperErrorDetail(errorBody: string): string | null {
	try {
		const parsed = JSON.parse(errorBody) as { detail?: unknown };
		return typeof parsed.detail === "string" ? parsed.detail : null;
	} catch {
		return null;
	}
}
