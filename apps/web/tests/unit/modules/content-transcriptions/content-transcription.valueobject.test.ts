import { describe, expect, it } from "vitest";
import {
	ContentTranscriptionSchema as ClipSETranscriptionSchema,
	formatContentTimestamp as formatClipSETimestamp,
	UpsertContentTranscriptionSchema as UpsertClipSETranscriptionSchema,
} from "~/modules/content-transcriptions/domain/content-transcription.valueobject";
import { ClipSETranscriptionMother } from "../../../mothers/domain-mothers";

describe("ClipSE transcription helpers", () => {
	it("formats ClipSE timestamps", () => {
		expect(formatClipSETimestamp(65.9)).toBe("01:05");
		expect(formatClipSETimestamp(3661.2)).toBe("01:01:01");
	});

	it("parses stored transcriptions and optional upsert metadata", () => {
		const transcription = ClipSETranscriptionMother.create();

		expect(ClipSETranscriptionSchema.parse(transcription).fullText).toBe(
			"Opening hook",
		);
		expect(
			UpsertClipSETranscriptionSchema.parse({
				videoId: transcription.videoId,
				language: "en",
				provider: "whisper",
				model: "large-v3-turbo",
				segments: transcription.segments,
				fullText: transcription.fullText,
			}),
		).toEqual({
			videoId: transcription.videoId,
			language: "en",
			provider: "whisper",
			model: "large-v3-turbo",
			segments: transcription.segments,
			fullText: transcription.fullText,
		});
	});
});
