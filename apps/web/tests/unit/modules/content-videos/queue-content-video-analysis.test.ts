import { describe, expect, it, vi } from "vitest";
import { queueContentVideoAnalysis } from "~/modules/content-videos/application/queue-content-video-analysis";
import {
	ContentTranscriptionMother,
	ContentVideoMother,
} from "../../../mothers/domain-mothers";
import {
	ClipSERepositoryMother,
	ContentChapterRepositoryMother,
	ContentJobRepositoryMother,
	ContentTranscriptionRepositoryMother,
	ContentVideoRepositoryMother,
} from "../../../mothers/repository-mothers";

describe("queueContentVideoAnalysis", () => {
	const videoId = "11111111-1111-4111-8111-111111111111";

	it("queues analysis with default clip and chapter generation", async () => {
		const updatedVideo = ContentVideoMother.create({
			id: videoId,
			processingStage: "analyzing",
		});
		const videoRepository = ContentVideoRepositoryMother.create({
			updateStage: vi.fn(async () => updatedVideo),
		});
		const transcriptionRepository =
			ContentTranscriptionRepositoryMother.create();
		const jobRepository = ContentJobRepositoryMother.create();
		const clipRepository = ClipSERepositoryMother.create();
		const chapterRepository = ContentChapterRepositoryMother.create();

		await expect(
			queueContentVideoAnalysis(
				videoRepository,
				transcriptionRepository,
				jobRepository,
				clipRepository,
				chapterRepository,
				{ videoId },
			),
		).resolves.toEqual(updatedVideo);
		expect(clipRepository.replaceForVideo).toHaveBeenCalledWith(
			videoId,
			[],
			"standard",
		);
		expect(clipRepository.replaceForVideo).not.toHaveBeenCalledWith(
			videoId,
			[],
			"short",
		);
		expect(chapterRepository.replaceForVideo).toHaveBeenCalledWith(videoId, []);
		expect(videoRepository.updateStage).toHaveBeenCalledWith({
			id: videoId,
			processingStage: "analyzing",
			latestError: null,
		});
		expect(jobRepository.enqueue).toHaveBeenCalledWith({
			videoId,
			type: "analyze-video",
			payload: expect.objectContaining({
				generateClips: true,
				generateShorts: false,
				generateChapters: true,
				requestedAt: expect.any(String),
			}),
		});
	});

	it("updates the analysis prompt and only clears selected output types", async () => {
		const videoRepository = ContentVideoRepositoryMother.create();
		const transcriptionRepository = ContentTranscriptionRepositoryMother.create(
			{
				findByVideoId: vi.fn(async () =>
					ContentTranscriptionMother.create({ videoId }),
				),
			},
		);
		const jobRepository = ContentJobRepositoryMother.create();
		const clipRepository = ClipSERepositoryMother.create();
		const chapterRepository = ContentChapterRepositoryMother.create();

		await queueContentVideoAnalysis(
			videoRepository,
			transcriptionRepository,
			jobRepository,
			clipRepository,
			chapterRepository,
			{
				videoId,
				analysisPrompt: "Focus on product updates",
				generateClips: false,
				generateChapters: true,
			},
		);

		expect(videoRepository.update).toHaveBeenCalledWith({
			id: videoId,
			analysisPrompt: "Focus on product updates",
		});
		expect(clipRepository.replaceForVideo).not.toHaveBeenCalled();
		expect(chapterRepository.replaceForVideo).toHaveBeenCalledWith(videoId, []);
		expect(jobRepository.enqueue).toHaveBeenCalledWith({
			videoId,
			type: "analyze-video",
			payload: expect.objectContaining({
				generateClips: false,
				generateShorts: false,
				generateChapters: true,
			}),
		});
	});

	it("clears and queues shorts independently from normal clips", async () => {
		const videoRepository = ContentVideoRepositoryMother.create();
		const clipRepository = ClipSERepositoryMother.create();
		const jobRepository = ContentJobRepositoryMother.create();

		await queueContentVideoAnalysis(
			videoRepository,
			ContentTranscriptionRepositoryMother.create(),
			jobRepository,
			clipRepository,
			ContentChapterRepositoryMother.create(),
			{
				videoId,
				generateClips: false,
				generateShorts: true,
				generateChapters: false,
			},
		);

		expect(clipRepository.replaceForVideo).toHaveBeenCalledWith(
			videoId,
			[],
			"short",
		);
		expect(clipRepository.replaceForVideo).not.toHaveBeenCalledWith(
			videoId,
			[],
			"standard",
		);
		expect(jobRepository.enqueue).toHaveBeenCalledWith({
			videoId,
			type: "analyze-video",
			payload: expect.objectContaining({
				generateClips: false,
				generateShorts: true,
				generateChapters: false,
			}),
		});
	});

	it("rejects when no output type is selected", async () => {
		await expect(
			queueContentVideoAnalysis(
				ContentVideoRepositoryMother.create(),
				ContentTranscriptionRepositoryMother.create(),
				ContentJobRepositoryMother.create(),
				ClipSERepositoryMother.create(),
				ContentChapterRepositoryMother.create(),
				{
					videoId,
					generateClips: false,
					generateShorts: false,
					generateChapters: false,
				},
			),
		).rejects.toThrow("Select clips, shorts, chapters, or a combination.");
	});

	it("rejects when the video is missing", async () => {
		const videoRepository = ContentVideoRepositoryMother.create({
			findById: vi.fn(async () => null),
		});
		const jobRepository = ContentJobRepositoryMother.create();

		await expect(
			queueContentVideoAnalysis(
				videoRepository,
				ContentTranscriptionRepositoryMother.create(),
				jobRepository,
				ClipSERepositoryMother.create(),
				ContentChapterRepositoryMother.create(),
				{ videoId },
			),
		).rejects.toThrow("Video not found");
		expect(jobRepository.enqueue).not.toHaveBeenCalled();
	});

	it("rejects when transcription is not ready", async () => {
		const transcriptionRepository = ContentTranscriptionRepositoryMother.create(
			{
				findByVideoId: vi.fn(async () => null),
			},
		);
		const jobRepository = ContentJobRepositoryMother.create();

		await expect(
			queueContentVideoAnalysis(
				ContentVideoRepositoryMother.create(),
				transcriptionRepository,
				jobRepository,
				ClipSERepositoryMother.create(),
				ContentChapterRepositoryMother.create(),
				{ videoId },
			),
		).rejects.toThrow("Transcription is not ready yet");
		expect(jobRepository.enqueue).not.toHaveBeenCalled();
	});
});
