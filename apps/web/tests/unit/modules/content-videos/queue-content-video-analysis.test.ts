import { describe, expect, it, vi } from "vitest";
import { queueContentVideoAnalysis } from "~/modules/content-videos/application/queue-content-video-analysis";
import {
	ContentTranscriptionMother,
	ContentVideoMother,
} from "../../../mothers/domain-mothers";
import {
	ContentChapterRepositoryMother,
	ContentClipRepositoryMother,
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
		const clipRepository = ContentClipRepositoryMother.create();
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
		expect(clipRepository.replaceForVideo).toHaveBeenCalledWith(videoId, []);
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
		const clipRepository = ContentClipRepositoryMother.create();
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
				generateChapters: true,
			}),
		});
	});

	it("rejects when no output type is selected", async () => {
		await expect(
			queueContentVideoAnalysis(
				ContentVideoRepositoryMother.create(),
				ContentTranscriptionRepositoryMother.create(),
				ContentJobRepositoryMother.create(),
				ContentClipRepositoryMother.create(),
				ContentChapterRepositoryMother.create(),
				{ videoId, generateClips: false, generateChapters: false },
			),
		).rejects.toThrow("Select clips, chapters, or both.");
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
				ContentClipRepositoryMother.create(),
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
				ContentClipRepositoryMother.create(),
				ContentChapterRepositoryMother.create(),
				{ videoId },
			),
		).rejects.toThrow("Transcription is not ready yet");
		expect(jobRepository.enqueue).not.toHaveBeenCalled();
	});
});
