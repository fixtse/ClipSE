import { describe, expect, it } from "vitest";
import {
	ContentTranscriptionSchema,
	formatContentTimestamp,
	UpsertContentTranscriptionSchema,
} from "~/modules/content-transcriptions/domain/content-transcription.valueobject";
import { ContentTranscriptionMother } from "../../../mothers/domain-mothers";

describe("content transcription helpers", () => {
	it("formats content timestamps", () => {
		expect(formatContentTimestamp(65.9)).toBe("01:05");
		expect(formatContentTimestamp(3661.2)).toBe("01:01:01");
	});

	it("parses stored transcriptions and optional upsert metadata", () => {
		const transcription = ContentTranscriptionMother.create();

		expect(ContentTranscriptionSchema.parse(transcription).fullText).toBe(
			"Opening hook",
		);
		expect(
			UpsertContentTranscriptionSchema.parse({
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
