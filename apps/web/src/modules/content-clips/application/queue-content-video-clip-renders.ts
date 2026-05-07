import type { ContentJobRepositoryInterface } from "~/modules/content-jobs/domain/content-job.repository.interface";
import type { ContentVideoRepositoryInterface } from "~/modules/content-videos/domain/content-video.repository.interface";
import type { ContentClipRepositoryInterface } from "../domain/content-clip.repository.interface";
import {
	parseContentClipRenderOptions,
	type QueueContentVideoClipRendersInput,
	QueueContentVideoClipRendersInputSchema,
} from "../domain/content-clip.valueobject";

export async function queueContentVideoClipRenders(
	clipRepository: ContentClipRepositoryInterface,
	videoRepository: ContentVideoRepositoryInterface,
	jobRepository: ContentJobRepositoryInterface,
	input: QueueContentVideoClipRendersInput,
): Promise<{ queuedCount: number }> {
	const validatedInput = QueueContentVideoClipRendersInputSchema.parse(input);
	const renderOptions = parseContentClipRenderOptions(validatedInput);
	const video = await videoRepository.findById(validatedInput.videoId);
	if (!video?.storageKey) {
		throw new Error("Source video is not available yet");
	}

	const clips = await clipRepository.listByVideoId(video.id);
	const renderableClips = clips.filter(
		(clip) => clip.status !== "queued" && clip.status !== "rendering",
	);

	await Promise.all(
		renderableClips.map(async (clip) => {
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
					aspectMode: renderOptions.aspectMode,
					burnSubtitles: renderOptions.burnSubtitles,
					...(renderOptions.focusMode
						? { focusMode: renderOptions.focusMode }
						: {}),
				},
			});
		}),
	);

	return { queuedCount: renderableClips.length };
}
