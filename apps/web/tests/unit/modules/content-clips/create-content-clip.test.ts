import { describe, expect, it, vi } from "vitest";
import { createContentClip } from "~/modules/content-clips/application/create-content-clip";
import { ContentClipMother } from "../../../mothers/domain-mothers";
import {
	ContentClipRepositoryMother,
	ContentVideoRepositoryMother,
} from "../../../mothers/repository-mothers";

describe("createContentClip", () => {
	const input = {
		videoId: "11111111-1111-4111-8111-111111111111",
		title: "Manual clip",
		hook: "Hook",
		summary: "Summary",
		startSeconds: 10,
		endSeconds: 30,
	};

	it("creates a clip when the source video exists and timing is valid", async () => {
		const createdClip = ContentClipMother.create(input);
		const clipRepository = ContentClipRepositoryMother.create({
			create: vi.fn(async () => createdClip),
		});
		const videoRepository = ContentVideoRepositoryMother.create();

		await expect(
			createContentClip(clipRepository, videoRepository, input),
		).resolves.toEqual(createdClip);
		expect(videoRepository.findById).toHaveBeenCalledWith(input.videoId);
		expect(clipRepository.create).toHaveBeenCalledWith({
			...input,
			clipKind: "standard",
			shortDetectionMode: "people",
		});
	});

	it("rejects when the source video is missing", async () => {
		const clipRepository = ContentClipRepositoryMother.create();
		const videoRepository = ContentVideoRepositoryMother.create({
			findById: vi.fn(async () => null),
		});

		await expect(
			createContentClip(clipRepository, videoRepository, input),
		).rejects.toThrow("Video not found");
		expect(clipRepository.create).not.toHaveBeenCalled();
	});

	it("rejects invalid timing", async () => {
		const clipRepository = ContentClipRepositoryMother.create();
		const videoRepository = ContentVideoRepositoryMother.create();

		await expect(
			createContentClip(clipRepository, videoRepository, {
				...input,
				startSeconds: 30,
				endSeconds: 30,
			}),
		).rejects.toThrow("Clip end time must be greater than the start time");
		expect(clipRepository.create).not.toHaveBeenCalled();
	});

	it("rejects clips that exceed the source duration", async () => {
		const clipRepository = ContentClipRepositoryMother.create();
		const videoRepository = ContentVideoRepositoryMother.create();

		await expect(
			createContentClip(clipRepository, videoRepository, {
				...input,
				endSeconds: 121,
			}),
		).rejects.toThrow("Clip end time exceeds source duration");
		expect(clipRepository.create).not.toHaveBeenCalled();
	});

	it("rejects invalid input before repository access", async () => {
		const clipRepository = ContentClipRepositoryMother.create();
		const videoRepository = ContentVideoRepositoryMother.create();

		await expect(
			createContentClip(clipRepository, videoRepository, {
				...input,
				videoId: "invalid-id",
			}),
		).rejects.toThrow();
		expect(videoRepository.findById).not.toHaveBeenCalled();
		expect(clipRepository.create).not.toHaveBeenCalled();
	});
});
