import type { ContentJobRepositoryInterface } from "~/modules/content-jobs/domain/content-job.repository.interface";
import type { ContentVideoRepositoryInterface } from "~/modules/content-videos/domain/content-video.repository.interface";
import type { ClipSERepositoryInterface } from "../domain/content-clip.repository.interface";
import {
	type ClipSE,
	parseClipSERenderOptions,
	type QueueClipSERenderInput,
	QueueClipSERenderInputSchema,
} from "../domain/content-clip.valueobject";

export async function queueClipSERender(
	clipRepository: ClipSERepositoryInterface,
	videoRepository: ContentVideoRepositoryInterface,
	jobRepository: ContentJobRepositoryInterface,
	input: QueueClipSERenderInput,
): Promise<ClipSE> {
	const validatedInput = QueueClipSERenderInputSchema.parse(input);
	const renderOptions = parseClipSERenderOptions(validatedInput);
	const clip = await clipRepository.findById(validatedInput.clipId);
	if (!clip) {
		throw new Error("Clip not found");
	}

	const video = await videoRepository.findById(clip.videoId);
	if (!video?.storageKey) {
		throw new Error("Source video is not available yet");
	}

	const effectiveRenderOptions =
		clip.clipKind === "short"
			? {
					...renderOptions,
					aspectMode: "vertical9x16" as const,
					focusMode: "auto-speaker" as const,
				}
			: renderOptions;

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

	return queuedClip;
}
