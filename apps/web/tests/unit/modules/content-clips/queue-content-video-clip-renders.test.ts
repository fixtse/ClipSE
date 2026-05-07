import { describe, expect, it, vi } from "vitest";
import { queueContentVideoClipRenders } from "~/modules/content-clips/application/queue-content-video-clip-renders";
import {
	ContentClipMother,
	ContentVideoMother,
} from "../../../mothers/domain-mothers";
import {
	ContentClipRepositoryMother,
	ContentJobRepositoryMother,
	ContentVideoRepositoryMother,
} from "../../../mothers/repository-mothers";

describe("queueContentVideoClipRenders", () => {
	it("queues render jobs for clips that are not already queued or rendering", async () => {
		const video = ContentVideoMother.create();
		const readyClip = ContentClipMother.create({
			id: "33333333-3333-4333-8333-333333333333",
			status: "ready",
			title: "Ready clip",
		});
		const queuedClip = ContentClipMother.create({
			id: "33333333-3333-4333-8333-333333333334",
			status: "queued",
		});
		const clipRepository = ContentClipRepositoryMother.create({
			listByVideoId: vi.fn(async () => [readyClip, queuedClip]),
		});
		const videoRepository = ContentVideoRepositoryMother.create({
			findById: vi.fn(async () => video),
		});
		const jobRepository = ContentJobRepositoryMother.create();

		await expect(
			queueContentVideoClipRenders(
				clipRepository,
				videoRepository,
				jobRepository,
				{ videoId: video.id },
			),
		).resolves.toEqual({ queuedCount: 1 });
		expect(clipRepository.updateStatus).toHaveBeenCalledWith({
			id: readyClip.id,
			status: "queued",
			latestError: null,
		});
		expect(jobRepository.enqueue).toHaveBeenCalledWith({
			videoId: video.id,
			clipId: readyClip.id,
			type: "render-clip",
			payload: {
				clipTitle: "Ready clip",
				startSeconds: readyClip.startSeconds,
				endSeconds: readyClip.endSeconds,
				queuedBy: "render-all",
				aspectMode: "source",
				burnSubtitles: false,
			},
		});
	});

	it("passes vertical subtitle options to every queued render job", async () => {
		const video = ContentVideoMother.create();
		const clips = [
			ContentClipMother.create({
				id: "33333333-3333-4333-8333-333333333333",
				title: "First",
			}),
			ContentClipMother.create({
				id: "33333333-3333-4333-8333-333333333334",
				title: "Second",
			}),
		];
		const clipRepository = ContentClipRepositoryMother.create({
			listByVideoId: vi.fn(async () => clips),
		});
		const jobRepository = ContentJobRepositoryMother.create();

		await queueContentVideoClipRenders(
			clipRepository,
			ContentVideoRepositoryMother.create({
				findById: vi.fn(async () => video),
			}),
			jobRepository,
			{
				videoId: video.id,
				aspectMode: "vertical9x16",
				burnSubtitles: true,
			},
		);

		expect(jobRepository.enqueue).toHaveBeenCalledTimes(2);
		expect(jobRepository.enqueue).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				payload: expect.objectContaining({
					clipTitle: "First",
					aspectMode: "vertical9x16",
					burnSubtitles: true,
					focusMode: "auto-speaker",
				}),
			}),
		);
		expect(jobRepository.enqueue).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				payload: expect.objectContaining({
					clipTitle: "Second",
					aspectMode: "vertical9x16",
					burnSubtitles: true,
					focusMode: "auto-speaker",
				}),
			}),
		);
	});

	it("rejects when the source video is unavailable", async () => {
		const clipRepository = ContentClipRepositoryMother.create();
		const videoRepository = ContentVideoRepositoryMother.create({
			findById: vi.fn(async () =>
				ContentVideoMother.create({ storageKey: null }),
			),
		});
		const jobRepository = ContentJobRepositoryMother.create();

		await expect(
			queueContentVideoClipRenders(
				clipRepository,
				videoRepository,
				jobRepository,
				{ videoId: "11111111-1111-4111-8111-111111111111" },
			),
		).rejects.toThrow("Source video is not available yet");
		expect(clipRepository.listByVideoId).not.toHaveBeenCalled();
	});

	it("does not enqueue jobs when all clips are already in progress", async () => {
		const video = ContentVideoMother.create();
		const clipRepository = ContentClipRepositoryMother.create({
			listByVideoId: vi.fn(async () => [
				ContentClipMother.create({ status: "queued" }),
				ContentClipMother.create({
					id: "33333333-3333-4333-8333-333333333334",
					status: "rendering",
				}),
			]),
		});
		const jobRepository = ContentJobRepositoryMother.create();

		await expect(
			queueContentVideoClipRenders(
				clipRepository,
				ContentVideoRepositoryMother.create({
					findById: vi.fn(async () => video),
				}),
				jobRepository,
				{ videoId: video.id },
			),
		).resolves.toEqual({ queuedCount: 0 });
		expect(clipRepository.updateStatus).not.toHaveBeenCalled();
		expect(jobRepository.enqueue).not.toHaveBeenCalled();
	});
});
