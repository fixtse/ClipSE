import type { ContentJobRepositoryInterface } from "~/modules/content-jobs/domain/content-job.repository.interface";
import type { ContentVideoRepositoryInterface } from "../domain/content-video.repository.interface";
import type { ContentVideo } from "../domain/content-video.valueobject";

export async function retryContentVideoDownload(
	videoRepository: ContentVideoRepositoryInterface,
	jobRepository: ContentJobRepositoryInterface,
	input: {
		videoId: string;
	},
): Promise<ContentVideo> {
	const video = await videoRepository.findById(input.videoId);
	if (!video) {
		throw new Error("Video not found");
	}

	const canRetryTranscription = Boolean(video.storageKey);
	const canRetryDownload =
		video.sourceType === "url" && Boolean(video.sourceUrl);
	if (!canRetryTranscription && !canRetryDownload) {
		throw new Error("This source cannot be retried.");
	}

	const updatedVideo = await videoRepository.updateStage({
		id: video.id,
		processingStage: canRetryTranscription ? "queued" : "uploading",
		latestError: null,
	});

	if (canRetryTranscription) {
		await jobRepository.enqueue({
			videoId: video.id,
			type: "transcribe-video",
			payload: {
				storageKey: video.storageKey,
				queuedBy: "retry",
				progressBase: video.sourceType === "url" ? 70 : 0,
				progressSpan: video.sourceType === "url" ? 25 : 100,
				retryOf: video.latestError,
			},
		});
		return updatedVideo;
	}

	await jobRepository.enqueue({
		videoId: video.id,
		type: "download-source",
		payload: {
			sourceUrl: video.sourceUrl,
			retryOf: video.latestError,
		},
	});

	return updatedVideo;
}
