import { describe, expect, it, vi } from "vitest";
import { getContentVideoTranscription } from "~/modules/content-transcriptions/application/get-content-video-transcription";
import { saveContentVideoTranscription } from "~/modules/content-transcriptions/application/save-content-video-transcription";
import { ClipSETranscriptionMother } from "../../../mothers/domain-mothers";
import { ClipSETranscriptionRepositoryMother } from "../../../mothers/repository-mothers";

describe("ClipSE transcription use cases", () => {
	it("gets the transcription for a video", async () => {
		const transcription = ClipSETranscriptionMother.create();
		const repository = ClipSETranscriptionRepositoryMother.create({
			findByVideoId: vi.fn(async () => transcription),
		});

		await expect(
			getContentVideoTranscription(repository, "video-1"),
		).resolves.toEqual(transcription);
		expect(repository.findByVideoId).toHaveBeenCalledWith("video-1");
	});

	it("saves a transcription", async () => {
		const transcription = ClipSETranscriptionMother.create();
		const input = {
			videoId: transcription.videoId,
			language: transcription.language,
			provider: transcription.provider,
			model: transcription.model,
			segments: transcription.segments,
			fullText: transcription.fullText,
			metadata: transcription.metadata,
		};
		const repository = ClipSETranscriptionRepositoryMother.create({
			upsert: vi.fn(async () => transcription),
		});

		await expect(
			saveContentVideoTranscription(repository, input),
		).resolves.toEqual(transcription);
		expect(repository.upsert).toHaveBeenCalledWith(input);
	});
});
