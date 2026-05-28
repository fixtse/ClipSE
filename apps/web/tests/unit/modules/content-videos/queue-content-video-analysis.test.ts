import { describe, expect, it, vi } from "vitest";
import { queueContentVideoAnalysis } from "~/modules/content-videos/application/queue-content-video-analysis";
import {
	ClipSETranscriptionMother,
	ClipSEVideoMother,
} from "../../../mothers/domain-mothers";
import {
	ClipSEChapterRepositoryMother,
	ClipSEJobRepositoryMother,
	ClipSERepositoryMother,
	ClipSETranscriptionRepositoryMother,
	ClipSEVideoRepositoryMother,
} from "../../../mothers/repository-mothers";

describe("queueContentVideoAnalysis", () => {
	const videoId = "11111111-1111-4111-8111-111111111111";

	it("queues analysis with default clip and chapter generation", async () => {
		const updatedVideo = ClipSEVideoMother.create({
			id: videoId,
			processingStage: "analyzing",
		});
		const videoRepository = ClipSEVideoRepositoryMother.create({
			updateStage: vi.fn(async () => updatedVideo),
		});
		const transcriptionRepository =
			ClipSETranscriptionRepositoryMother.create();
		const jobRepository = ClipSEJobRepositoryMother.create();
		const clipRepository = ClipSERepositoryMother.create();
		const chapterRepository = ClipSEChapterRepositoryMother.create();

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
		const videoRepository = ClipSEVideoRepositoryMother.create();
		const transcriptionRepository = ClipSETranscriptionRepositoryMother.create({
			findByVideoId: vi.fn(async () =>
				ClipSETranscriptionMother.create({ videoId }),
			),
		});
		const jobRepository = ClipSEJobRepositoryMother.create();
		const clipRepository = ClipSERepositoryMother.create();
		const chapterRepository = ClipSEChapterRepositoryMother.create();

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
		const videoRepository = ClipSEVideoRepositoryMother.create();
		const clipRepository = ClipSERepositoryMother.create();
		const jobRepository = ClipSEJobRepositoryMother.create();

		await queueContentVideoAnalysis(
			videoRepository,
			ClipSETranscriptionRepositoryMother.create(),
			jobRepository,
			clipRepository,
			ClipSEChapterRepositoryMother.create(),
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
				ClipSEVideoRepositoryMother.create(),
				ClipSETranscriptionRepositoryMother.create(),
				ClipSEJobRepositoryMother.create(),
				ClipSERepositoryMother.create(),
				ClipSEChapterRepositoryMother.create(),
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
		const videoRepository = ClipSEVideoRepositoryMother.create({
			findById: vi.fn(async () => null),
		});
		const jobRepository = ClipSEJobRepositoryMother.create();

		await expect(
			queueContentVideoAnalysis(
				videoRepository,
				ClipSETranscriptionRepositoryMother.create(),
				jobRepository,
				ClipSERepositoryMother.create(),
				ClipSEChapterRepositoryMother.create(),
				{ videoId },
			),
		).rejects.toThrow("Video not found");
		expect(jobRepository.enqueue).not.toHaveBeenCalled();
	});

	it("rejects when transcription is not ready", async () => {
		const transcriptionRepository = ClipSETranscriptionRepositoryMother.create({
			findByVideoId: vi.fn(async () => null),
		});
		const jobRepository = ClipSEJobRepositoryMother.create();

		await expect(
			queueContentVideoAnalysis(
				ClipSEVideoRepositoryMother.create(),
				transcriptionRepository,
				jobRepository,
				ClipSERepositoryMother.create(),
				ClipSEChapterRepositoryMother.create(),
				{ videoId },
			),
		).rejects.toThrow("Transcription is not ready yet");
		expect(jobRepository.enqueue).not.toHaveBeenCalled();
	});
});
