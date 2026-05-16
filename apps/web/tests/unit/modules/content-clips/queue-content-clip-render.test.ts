import { describe, expect, it, vi } from "vitest";
import { queueClipSERender } from "~/modules/content-clips/application/queue-content-clip-render";
import {
	ClipSEMother,
	ContentVideoMother,
} from "../../../mothers/domain-mothers";
import {
	ClipSERepositoryMother,
	ContentJobRepositoryMother,
	ContentVideoRepositoryMother,
} from "../../../mothers/repository-mothers";

describe("queueClipSERender", () => {
	it("queues a render job and clears previous clip errors", async () => {
		const clip = ClipSEMother.create({
			id: "33333333-3333-4333-8333-333333333333",
			title: "Render me",
			startSeconds: 12,
			endSeconds: 34,
			latestError: "Previous failure",
		});
		const queuedClip = ClipSEMother.create({
			...clip,
			status: "queued",
			latestError: null,
		});
		const video = ContentVideoMother.create({
			id: clip.videoId,
			storageKey: "videos/source.mp4",
		});
		const clipRepository = ClipSERepositoryMother.create({
			findById: vi.fn(async () => clip),
			updateStatus: vi.fn(async () => queuedClip),
		});
		const videoRepository = ContentVideoRepositoryMother.create({
			findById: vi.fn(async () => video),
		});
		const jobRepository = ContentJobRepositoryMother.create();

		await expect(
			queueClipSERender(clipRepository, videoRepository, jobRepository, {
				clipId: clip.id,
			}),
		).resolves.toEqual(queuedClip);
		expect(clipRepository.updateStatus).toHaveBeenCalledWith({
			id: clip.id,
			status: "queued",
			latestError: null,
		});
		expect(jobRepository.enqueue).toHaveBeenCalledWith({
			videoId: video.id,
			clipId: clip.id,
			type: "render-clip",
			payload: {
				clipTitle: "Render me",
				startSeconds: 12,
				endSeconds: 34,
				aspectMode: "source",
				burnSubtitles: false,
				clipKind: "standard",
			},
		});
	});

	it("queues a vertical render job with subtitle options", async () => {
		const clip = ClipSEMother.create({
			id: "33333333-3333-4333-8333-333333333333",
			title: "Vertical render",
		});
		const video = ContentVideoMother.create({
			id: clip.videoId,
			storageKey: "videos/source.mp4",
		});
		const clipRepository = ClipSERepositoryMother.create({
			findById: vi.fn(async () => clip),
			updateStatus: vi.fn(async () =>
				ClipSEMother.create({ ...clip, status: "queued" }),
			),
		});
		const videoRepository = ContentVideoRepositoryMother.create({
			findById: vi.fn(async () => video),
		});
		const jobRepository = ContentJobRepositoryMother.create();

		await queueClipSERender(clipRepository, videoRepository, jobRepository, {
			clipId: clip.id,
			aspectMode: "vertical9x16",
			burnSubtitles: true,
		});

		expect(jobRepository.enqueue).toHaveBeenCalledWith({
			videoId: video.id,
			clipId: clip.id,
			type: "render-clip",
			payload: {
				clipTitle: "Vertical render",
				startSeconds: clip.startSeconds,
				endSeconds: clip.endSeconds,
				aspectMode: "vertical9x16",
				burnSubtitles: true,
				clipKind: "standard",
				focusMode: "auto-speaker",
			},
		});
	});

	it("forces shorts to vertical render jobs with their detection mode", async () => {
		const clip = ClipSEMother.create({
			clipKind: "short",
			shortDetectionMode: "screen_only",
		});
		const video = ContentVideoMother.create({
			id: clip.videoId,
			storageKey: "videos/source.mp4",
		});
		const jobRepository = ContentJobRepositoryMother.create();

		await queueClipSERender(
			ClipSERepositoryMother.create({
				findById: vi.fn(async () => clip),
			}),
			ContentVideoRepositoryMother.create({
				findById: vi.fn(async () => video),
			}),
			jobRepository,
			{
				clipId: clip.id,
				aspectMode: "source",
			},
		);

		expect(jobRepository.enqueue).toHaveBeenCalledWith({
			videoId: video.id,
			clipId: clip.id,
			type: "render-clip",
			payload: expect.objectContaining({
				clipKind: "short",
				aspectMode: "vertical9x16",
				focusMode: "auto-speaker",
				shortDetectionMode: "screen_only",
			}),
		});
	});

	it("rejects when the clip is missing", async () => {
		const clipRepository = ClipSERepositoryMother.create({
			findById: vi.fn(async () => null),
		});
		const videoRepository = ContentVideoRepositoryMother.create();
		const jobRepository = ContentJobRepositoryMother.create();

		await expect(
			queueClipSERender(clipRepository, videoRepository, jobRepository, {
				clipId: "33333333-3333-4333-8333-333333333333",
			}),
		).rejects.toThrow("Clip not found");
		expect(jobRepository.enqueue).not.toHaveBeenCalled();
	});

	it("rejects when the source video is not available", async () => {
		const clip = ClipSEMother.create();
		const clipRepository = ClipSERepositoryMother.create({
			findById: vi.fn(async () => clip),
		});
		const videoRepository = ContentVideoRepositoryMother.create({
			findById: vi.fn(async () =>
				ContentVideoMother.create({ storageKey: null }),
			),
		});
		const jobRepository = ContentJobRepositoryMother.create();

		await expect(
			queueClipSERender(clipRepository, videoRepository, jobRepository, {
				clipId: clip.id,
			}),
		).rejects.toThrow("Source video is not available yet");
		expect(jobRepository.enqueue).not.toHaveBeenCalled();
	});
});
