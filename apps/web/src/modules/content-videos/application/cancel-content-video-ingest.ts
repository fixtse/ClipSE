import type { ContentVideoRepositoryInterface } from "../domain/content-video.repository.interface";

export async function cancelContentVideoIngest(
	videoRepository: ContentVideoRepositoryInterface,
	input: {
		videoId: string;
	},
): Promise<{ id: string }> {
	const video = await videoRepository.findById(input.videoId);
	if (!video) {
		return { id: input.videoId };
	}

	const cancellableStages = [
		"uploading",
		"queued",
		"transcribing",
		"failed",
	] as const;
	if (!cancellableStages.includes(video.processingStage as never)) {
		throw new Error(
			"Only uploading, queued, transcribing, or failed sources can be deleted.",
		);
	}

	await videoRepository.delete(input.videoId);

	return { id: input.videoId };
}
