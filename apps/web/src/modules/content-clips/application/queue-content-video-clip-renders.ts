import type { ContentJobRepositoryInterface } from "~/modules/content-jobs/domain/content-job.repository.interface";
import type { ContentVideoRepositoryInterface } from "~/modules/content-videos/domain/content-video.repository.interface";
import type { ClipSERepositoryInterface } from "../domain/content-clip.repository.interface";
import {
	parseClipSERenderOptions,
	type QueueContentVideoClipRendersInput,
	QueueContentVideoClipRendersInputSchema,
} from "../domain/content-clip.valueobject";

export async function queueContentVideoClipRenders(
	clipRepository: ClipSERepositoryInterface,
	videoRepository: ContentVideoRepositoryInterface,
	jobRepository: ContentJobRepositoryInterface,
	input: QueueContentVideoClipRendersInput,
): Promise<{ queuedCount: number }> {
	const validatedInput = QueueContentVideoClipRendersInputSchema.parse(input);
	const renderOptions = parseClipSERenderOptions(validatedInput);
	const video = await videoRepository.findById(validatedInput.videoId);
	if (!video?.storageKey) {
		throw new Error("Source video is not available yet");
	}

	const clips = await clipRepository.listByVideoId(
		video.id,
		validatedInput.clipKind,
	);
	const renderableClips = clips.filter(
		(clip) => clip.status !== "queued" && clip.status !== "rendering",
	);

	await Promise.all(
		renderableClips.map(async (clip) => {
			const effectiveRenderOptions =
				clip.clipKind === "short"
					? {
							...renderOptions,
							aspectMode: "vertical9x16" as const,
							focusMode: "auto-speaker" as const,
						}
					: renderOptions;

			await clipRepository.updateStatus({
				id: clip.id,
				status: "queued",
				latestError: null,
			});

			await jobRepository.enqueue({
				videoId: video.id,
				clipId: clip.id,
				type: "render-clip",
				payload: {
					clipTitle: clip.title,
					startSeconds: clip.startSeconds,
					endSeconds: clip.endSeconds,
					queuedBy: "render-all",
					aspectMode: effectiveRenderOptions.aspectMode,
					burnSubtitles: effectiveRenderOptions.burnSubtitles,
					clipKind: clip.clipKind,
					...(clip.clipKind === "short"
						? { shortDetectionMode: clip.shortDetectionMode }
						: {}),
					...(effectiveRenderOptions.focusMode
						? { focusMode: effectiveRenderOptions.focusMode }
						: {}),
				},
			});
		}),
	);

	return { queuedCount: renderableClips.length };
}
