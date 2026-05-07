import type { ContentChapterRepositoryInterface } from "~/modules/content-chapters/domain/content-chapter.repository.interface";
import type { ContentClipRepositoryInterface } from "~/modules/content-clips/domain/content-clip.repository.interface";
import type { ContentJobRepositoryInterface } from "~/modules/content-jobs/domain/content-job.repository.interface";
import type { ContentTranscriptionRepositoryInterface } from "~/modules/content-transcriptions/domain/content-transcription.repository.interface";
import type { ContentVideoRepositoryInterface } from "../domain/content-video.repository.interface";
import type { ContentVideo } from "../domain/content-video.valueobject";

export async function queueContentVideoAnalysis(
	videoRepository: ContentVideoRepositoryInterface,
	transcriptionRepository: ContentTranscriptionRepositoryInterface,
	jobRepository: ContentJobRepositoryInterface,
	clipRepository: ContentClipRepositoryInterface,
	chapterRepository: ContentChapterRepositoryInterface,
	input: {
		videoId: string;
		analysisPrompt?: string;
		generateClips?: boolean;
		generateChapters?: boolean;
	},
): Promise<ContentVideo> {
	const shouldGenerateClips = input.generateClips ?? true;
	const shouldGenerateChapters = input.generateChapters ?? true;
	if (!shouldGenerateClips && !shouldGenerateChapters) {
		throw new Error("Select clips, chapters, or both.");
	}

	const video = await videoRepository.findById(input.videoId);
	if (!video) {
		throw new Error("Video not found");
	}

	const transcription = await transcriptionRepository.findByVideoId(
		input.videoId,
	);
	if (!transcription) {
		throw new Error(
			"Transcription is not ready yet. Re-run analysis after transcription completes.",
		);
	}

	if (input.analysisPrompt !== undefined) {
		await videoRepository.update({
			id: input.videoId,
			analysisPrompt: input.analysisPrompt,
		});
	}

	if (shouldGenerateClips) {
		await clipRepository.replaceForVideo(input.videoId, []);
	}
	if (shouldGenerateChapters) {
		await chapterRepository.replaceForVideo(input.videoId, []);
	}
	const updatedVideo = await videoRepository.updateStage({
		id: input.videoId,
		processingStage: "analyzing",
		latestError: null,
	});

	await jobRepository.enqueue({
		videoId: input.videoId,
		type: "analyze-video",
		payload: {
			generateClips: shouldGenerateClips,
			generateChapters: shouldGenerateChapters,
			requestedAt: new Date().toISOString(),
		},
	});

	return updatedVideo;
}
