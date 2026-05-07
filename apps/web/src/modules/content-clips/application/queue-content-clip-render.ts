import type { ContentJobRepositoryInterface } from "~/modules/content-jobs/domain/content-job.repository.interface";
import type { ContentVideoRepositoryInterface } from "~/modules/content-videos/domain/content-video.repository.interface";
import type { ContentClipRepositoryInterface } from "../domain/content-clip.repository.interface";
import {
	type ContentClip,
	parseContentClipRenderOptions,
	type QueueContentClipRenderInput,
	QueueContentClipRenderInputSchema,
} from "../domain/content-clip.valueobject";

export async function queueContentClipRender(
	clipRepository: ContentClipRepositoryInterface,
	videoRepository: ContentVideoRepositoryInterface,
	jobRepository: ContentJobRepositoryInterface,
	input: QueueContentClipRenderInput,
): Promise<ContentClip> {
	const validatedInput = QueueContentClipRenderInputSchema.parse(input);
	const renderOptions = parseContentClipRenderOptions(validatedInput);
	const clip = await clipRepository.findById(validatedInput.clipId);
	if (!clip) {
		throw new Error("Clip not found");
	}

	const video = await videoRepository.findById(clip.videoId);
	if (!video?.storageKey) {
		throw new Error("Source video is not available yet");
	}

	const queuedClip = await clipRepository.updateStatus({
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
			aspectMode: renderOptions.aspectMode,
			burnSubtitles: renderOptions.burnSubtitles,
			...(renderOptions.focusMode
				? { focusMode: renderOptions.focusMode }
				: {}),
		},
	});

	return queuedClip;
}
