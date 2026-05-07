import { describe, expect, it, vi } from "vitest";
import { cancelContentVideoIngest } from "~/modules/content-videos/application/cancel-content-video-ingest";
import { createContentVideoUrlSource } from "~/modules/content-videos/application/create-content-video-url-source";
import { markContentVideoUploaded } from "~/modules/content-videos/application/mark-content-video-uploaded";
import { retryContentVideoDownload } from "~/modules/content-videos/application/retry-content-video-download";
import { updateContentVideo } from "~/modules/content-videos/application/update-content-video";
import { ContentVideoMother } from "../../../mothers/domain-mothers";
import {
	ContentJobRepositoryMother,
	ContentVideoRepositoryMother,
} from "../../../mothers/repository-mothers";

describe("content video action use cases", () => {
	it("cancels ingest for cancellable videos and no-ops missing videos", async () => {
		const video = ContentVideoMother.create({ processingStage: "queued" });
		const videoRepository = ContentVideoRepositoryMother.create({
			findById: vi.fn(async () => video),
		});

		await expect(
			cancelContentVideoIngest(videoRepository, { videoId: video.id }),
		).resolves.toEqual({ id: video.id });
		expect(videoRepository.delete).toHaveBeenCalledWith(video.id);

		const missingRepository = ContentVideoRepositoryMother.create({
			findById: vi.fn(async () => null),
		});
		await expect(
			cancelContentVideoIngest(missingRepository, { videoId: video.id }),
		).resolves.toEqual({ id: video.id });
		expect(missingRepository.delete).not.toHaveBeenCalled();
	});

	it("rejects cancellation for ready videos", async () => {
		const videoRepository = ContentVideoRepositoryMother.create({
			findById: vi.fn(async () =>
				ContentVideoMother.create({ processingStage: "ready" }),
			),
		});

		await expect(
			cancelContentVideoIngest(videoRepository, {
				videoId: "11111111-1111-4111-8111-111111111111",
			}),
		).rejects.toThrow(
			"Only uploading, queued, transcribing, or failed sources can be deleted.",
		);
	});

	it("creates URL sources and enqueues a download job", async () => {
		const createdVideo = ContentVideoMother.create({
			sourceType: "url",
			sourceUrl: "https://example.com/video",
		});
		const videoRepository = ContentVideoRepositoryMother.create({
			createDraft: vi.fn(async () => createdVideo),
		});
		const jobRepository = ContentJobRepositoryMother.create();

		await expect(
			createContentVideoUrlSource(videoRepository, jobRepository, {
				sourceUrl: "https://www.example.com/watch?v=1",
				title: "URL video",
				languageHint: "en",
			}),
		).resolves.toEqual(createdVideo);
		expect(videoRepository.createDraft).toHaveBeenCalledWith(
			expect.objectContaining({
				originalFilename: "example.com.mp4",
				sourceType: "url",
				sourceUrl: "https://www.example.com/watch?v=1",
				title: "URL video",
			}),
		);
		expect(jobRepository.enqueue).toHaveBeenCalledWith({
			videoId: createdVideo.id,
			type: "download-source",
			payload: {
				sourceUrl: "https://www.example.com/watch?v=1",
			},
		});
	});

	it("rejects invalid URL source input before creating drafts or jobs", async () => {
		const videoRepository = ContentVideoRepositoryMother.create();
		const jobRepository = ContentJobRepositoryMother.create();

		await expect(
			createContentVideoUrlSource(videoRepository, jobRepository, {
				sourceUrl: "not-a-url",
			}),
		).rejects.toThrow();
		expect(videoRepository.createDraft).not.toHaveBeenCalled();
		expect(jobRepository.enqueue).not.toHaveBeenCalled();
	});

	it("marks uploads and enqueues transcription", async () => {
		const video = ContentVideoMother.create();
		const videoRepository = ContentVideoRepositoryMother.create({
			markUploaded: vi.fn(async () => video),
		});
		const jobRepository = ContentJobRepositoryMother.create();

		await expect(
			markContentVideoUploaded(videoRepository, jobRepository, {
				id: video.id,
				storageKey: "videos/source.mp4",
			}),
		).resolves.toEqual(video);
		expect(jobRepository.enqueue).toHaveBeenCalledWith({
			videoId: video.id,
			type: "transcribe-video",
			payload: {
				storageKey: "videos/source.mp4",
			},
		});
	});

	it("updates video metadata through the repository", async () => {
		const videoRepository = ContentVideoRepositoryMother.create();

		await updateContentVideo(videoRepository, {
			id: "11111111-1111-4111-8111-111111111111",
			title: "Updated video",
		});
		expect(videoRepository.update).toHaveBeenCalledWith({
			id: "11111111-1111-4111-8111-111111111111",
			title: "Updated video",
		});
	});

	it("rejects invalid video updates before calling the repository", async () => {
		const videoRepository = ContentVideoRepositoryMother.create();

		await expect(
			updateContentVideo(videoRepository, {
				id: "11111111-1111-4111-8111-111111111111",
				title: "",
			}),
		).rejects.toThrow();
		expect(videoRepository.update).not.toHaveBeenCalled();
	});

	it("retries transcription when storage exists", async () => {
		const video = ContentVideoMother.create({
			sourceType: "url",
			storageKey: "videos/source.mp4",
			latestError: "Previous failure",
		});
		const videoRepository = ContentVideoRepositoryMother.create({
			findById: vi.fn(async () => video),
		});
		const jobRepository = ContentJobRepositoryMother.create();

		await retryContentVideoDownload(videoRepository, jobRepository, {
			videoId: video.id,
		});
		expect(videoRepository.updateStage).toHaveBeenCalledWith({
			id: video.id,
			processingStage: "queued",
			latestError: null,
		});
		expect(jobRepository.enqueue).toHaveBeenCalledWith({
			videoId: video.id,
			type: "transcribe-video",
			payload: {
				storageKey: "videos/source.mp4",
				queuedBy: "retry",
				progressBase: 70,
				progressSpan: 25,
				retryOf: "Previous failure",
			},
		});
	});

	it("retries download for URL sources and rejects non-retryable sources", async () => {
		const urlVideo = ContentVideoMother.create({
			sourceType: "url",
			sourceUrl: "https://example.com/video",
			storageKey: null,
			latestError: "Download failed",
		});
		const videoRepository = ContentVideoRepositoryMother.create({
			findById: vi.fn(async () => urlVideo),
		});
		const jobRepository = ContentJobRepositoryMother.create();

		await retryContentVideoDownload(videoRepository, jobRepository, {
			videoId: urlVideo.id,
		});
		expect(videoRepository.updateStage).toHaveBeenCalledWith({
			id: urlVideo.id,
			processingStage: "uploading",
			latestError: null,
		});
		expect(jobRepository.enqueue).toHaveBeenCalledWith({
			videoId: urlVideo.id,
			type: "download-source",
			payload: {
				sourceUrl: "https://example.com/video",
				retryOf: "Download failed",
			},
		});

		const fileRepository = ContentVideoRepositoryMother.create({
			findById: vi.fn(async () =>
				ContentVideoMother.create({ sourceType: "file", storageKey: null }),
			),
		});
		await expect(
			retryContentVideoDownload(fileRepository, jobRepository, {
				videoId: urlVideo.id,
			}),
		).rejects.toThrow("This source cannot be retried.");
	});

	it("rejects retry for missing videos", async () => {
		await expect(
			retryContentVideoDownload(
				ContentVideoRepositoryMother.create({
					findById: vi.fn(async () => null),
				}),
				ContentJobRepositoryMother.create(),
				{ videoId: "11111111-1111-4111-8111-111111111111" },
			),
		).rejects.toThrow("Video not found");
	});
});
