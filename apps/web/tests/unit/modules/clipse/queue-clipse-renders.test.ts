import { describe, expect, it, vi } from "vitest";
import { queueContentVideoClipRenders } from "~/modules/content-clips/application/queue-content-video-clip-renders";
import {
	ClipSEMother,
	ClipSEVideoMother,
} from "../../../mothers/domain-mothers";
import {
	ClipSEJobRepositoryMother,
	ClipSERepositoryMother,
	ClipSEVideoRepositoryMother,
} from "../../../mothers/repository-mothers";

describe("queueContentVideoClipRenders", () => {
	it("queues render jobs for clips that are not already queued or rendering", async () => {
		const video = ClipSEVideoMother.create();
		const readyClip = ClipSEMother.create({
			id: "33333333-3333-4333-8333-333333333333",
			status: "ready",
			title: "Ready clip",
		});
		const queuedClip = ClipSEMother.create({
			id: "33333333-3333-4333-8333-333333333334",
			status: "queued",
		});
		const clipRepository = ClipSERepositoryMother.create({
			listByVideoId: vi.fn(async () => [readyClip, queuedClip]),
		});
		const videoRepository = ClipSEVideoRepositoryMother.create({
			findById: vi.fn(async () => video),
		});
		const jobRepository = ClipSEJobRepositoryMother.create();

		await expect(
			queueContentVideoClipRenders(
				clipRepository,
				videoRepository,
				jobRepository,
				{ videoId: video.id },
			),
		).resolves.toEqual({ queuedCount: 1 });
		expect(clipRepository.listByVideoId).toHaveBeenCalledWith(
			video.id,
			undefined,
		);
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
				clipKind: "standard",
			},
		});
	});

	it("passes vertical subtitle options to every queued render job", async () => {
		const video = ClipSEVideoMother.create();
		const clips = [
			ClipSEMother.create({
				id: "33333333-3333-4333-8333-333333333333",
				title: "First",
			}),
			ClipSEMother.create({
				id: "33333333-3333-4333-8333-333333333334",
				title: "Second",
			}),
		];
		const clipRepository = ClipSERepositoryMother.create({
			listByVideoId: vi.fn(async () => clips),
		});
		const jobRepository = ClipSEJobRepositoryMother.create();

		await queueContentVideoClipRenders(
			clipRepository,
			ClipSEVideoRepositoryMother.create({
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

	it("filters render-all by clip kind and forces vertical shorts with detection mode", async () => {
		const video = ClipSEVideoMother.create();
		const short = ClipSEMother.create({
			clipKind: "short",
			shortDetectionMode: "people_and_screen",
			title: "Short",
		});
		const clipRepository = ClipSERepositoryMother.create({
			listByVideoId: vi.fn(async () => [short]),
		});
		const jobRepository = ClipSEJobRepositoryMother.create();

		await queueContentVideoClipRenders(
			clipRepository,
			ClipSEVideoRepositoryMother.create({
				findById: vi.fn(async () => video),
			}),
			jobRepository,
			{
				videoId: video.id,
				clipKind: "short",
				aspectMode: "source",
			},
		);

		expect(clipRepository.listByVideoId).toHaveBeenCalledWith(
			video.id,
			"short",
		);
		expect(jobRepository.enqueue).toHaveBeenCalledWith({
			videoId: video.id,
			clipId: short.id,
			type: "render-clip",
			payload: expect.objectContaining({
				clipKind: "short",
				aspectMode: "vertical9x16",
				focusMode: "auto-speaker",
				shortDetectionMode: "people_and_screen",
			}),
		});
	});

	it("rejects when the source video is unavailable", async () => {
		const clipRepository = ClipSERepositoryMother.create();
		const videoRepository = ClipSEVideoRepositoryMother.create({
			findById: vi.fn(async () =>
				ClipSEVideoMother.create({ storageKey: null }),
			),
		});
		const jobRepository = ClipSEJobRepositoryMother.create();

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
		const video = ClipSEVideoMother.create();
		const clipRepository = ClipSERepositoryMother.create({
			listByVideoId: vi.fn(async () => [
				ClipSEMother.create({ status: "queued" }),
				ClipSEMother.create({
					id: "33333333-3333-4333-8333-333333333334",
					status: "rendering",
				}),
			]),
		});
		const jobRepository = ClipSEJobRepositoryMother.create();

		await expect(
			queueContentVideoClipRenders(
				clipRepository,
				ClipSEVideoRepositoryMother.create({
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
