import { describe, expect, it, vi } from "vitest";
import { createContentVideoDraft } from "~/modules/content-videos/application/create-content-video-draft";
import { ClipSEVideoMother } from "../../../mothers/domain-mothers";
import { ClipSEVideoRepositoryMother } from "../../../mothers/repository-mothers";

describe("createContentVideoDraft", () => {
	it("validates input and delegates draft creation to the repository", async () => {
		const createdVideo = ClipSEVideoMother.create({
			originalFilename: "launch.mp4",
			title: "launch",
		});
		const videoRepository = ClipSEVideoRepositoryMother.create({
			createDraft: vi.fn(async () => createdVideo),
		});
		const input = {
			originalFilename: "launch.mp4",
			sizeBytes: 1024,
			mimeType: "video/mp4",
		};

		await expect(
			createContentVideoDraft(videoRepository, input),
		).resolves.toEqual(createdVideo);
		expect(videoRepository.createDraft).toHaveBeenCalledWith(input);
	});
});
