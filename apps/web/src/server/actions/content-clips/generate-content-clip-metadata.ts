"use server";

import { contentClipRepository } from "~/modules/content-clips/infrastructure/content-clip.repository";
import { contentTranscriptionRepository } from "~/modules/content-transcriptions/infrastructure/content-transcription.repository";
import { contentVideoRepository } from "~/modules/content-videos/infrastructure/content-video.repository";
import { requireSession } from "~/server/auth";
import { generateClipMetadataForTranscriptRange } from "~/server/lib/contentclip-ai";

type GenerateContentClipMetadataActionResult =
	| {
			success: true;
			data: Awaited<ReturnType<typeof contentClipRepository.update>>;
	  }
	| {
			success: false;
			error: string;
	  };

export async function generateContentClipMetadataAction(input: {
	clipId: string;
	startSeconds: number;
	endSeconds: number;
}): Promise<GenerateContentClipMetadataActionResult> {
	try {
		await requireSession();
		const clip = await contentClipRepository.findById(input.clipId);
		if (!clip) {
			return { success: false, error: "Clip not found" };
		}

		if (input.endSeconds <= input.startSeconds) {
			return { success: false, error: "Clip end must be after clip start" };
		}

		const [video, transcription] = await Promise.all([
			contentVideoRepository.findById(clip.videoId),
			contentTranscriptionRepository.findByVideoId(clip.videoId),
		]);

		if (!video || !transcription) {
			return {
				success: false,
				error: "Source transcription is not ready for AI clip metadata.",
			};
		}

		const metadata = await generateClipMetadataForTranscriptRange({
			video,
			transcription,
			startSeconds: input.startSeconds,
			endSeconds: input.endSeconds,
		});

		const updatedClip = await contentClipRepository.update({
			id: clip.id,
			title: metadata.title,
			hook: metadata.hook,
			summary: metadata.summary,
			rationale: metadata.rationale,
			transcriptExcerpt: metadata.transcriptExcerpt,
			startSeconds: metadata.startSeconds,
			endSeconds: metadata.endSeconds,
			score: Math.round(metadata.score),
			tags: metadata.tags,
		});

		return {
			success: true,
			data: updatedClip,
		};
	} catch (error) {
		console.error("Failed to generate content clip metadata:", error);
		return {
			success: false,
			error:
				error instanceof Error
					? error.message
					: "Failed to generate content clip metadata",
		};
	}
}
