import { readFile } from "node:fs/promises";
import { basename } from "node:path";
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
	const formData = new FormData();
	const fileBuffer = await readFile(input.audioFilePath);
	const fileName = basename(input.audioFilePath);

	formData.set(
		"file",
		new File([fileBuffer], fileName, {
			type: "audio/wav",
		}),
	);

	const aiSettings = await contentAiSettingsRepository.get();
	const model = aiSettings.whisperModel;
	formData.set("model", model);

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
		throw new Error(
			`Whisper service failed with ${response.status}: ${errorDetail}`,
		);
	}

	const payload = whisperResponseSchema.parse(await response.json());
	return {
		text: payload.text,
		language: payload.language,
		model,
		segments: payload.segments,
		durationSeconds: payload.duration,
	};
}

function parseWhisperErrorDetail(errorBody: string): string | null {
	try {
		const parsed = JSON.parse(errorBody) as { detail?: unknown };
		return typeof parsed.detail === "string" ? parsed.detail : null;
	} catch {
		return null;
	}
}
