"use server";

import { contentChapterRepository } from "~/modules/content-chapters/infrastructure/content-chapter.repository";
import { contentClipRepository } from "~/modules/content-clips/infrastructure/content-clip.repository";
import { contentJobRepository } from "~/modules/content-jobs/infrastructure/content-job.repository";
import { contentTranscriptionRepository } from "~/modules/content-transcriptions/infrastructure/content-transcription.repository";
import { queueContentVideoAnalysis } from "~/modules/content-videos/application/queue-content-video-analysis";
import { contentVideoRepository } from "~/modules/content-videos/infrastructure/content-video.repository";
import { requireSession } from "~/server/auth";

type ReanalyzeContentVideoActionResult =
	| {
			success: true;
			data: Awaited<ReturnType<typeof queueContentVideoAnalysis>>;
	  }
	| {
			success: false;
			error: string;
	  };

export async function reanalyzeContentVideoAction(input: {
	videoId: string;
	analysisPrompt?: string;
	generateClips?: boolean;
	generateShorts?: boolean;
	generateChapters?: boolean;
}): Promise<ReanalyzeContentVideoActionResult> {
	try {
		await requireSession();
		const video = await queueContentVideoAnalysis(
			contentVideoRepository,
			contentTranscriptionRepository,
			contentJobRepository,
			contentClipRepository,
			contentChapterRepository,
			input,
		);

		return {
			success: true,
			data: video,
		};
	} catch (error) {
		console.error("Failed to reanalyze content video:", error);
		return {
			success: false,
			error:
				error instanceof Error
					? error.message
					: "Failed to reanalyze content video",
		};
	}
}
