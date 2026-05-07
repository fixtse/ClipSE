import type { ContentJobRepositoryInterface } from "~/modules/content-jobs/domain/content-job.repository.interface";
import type { ContentVideoRepositoryInterface } from "../domain/content-video.repository.interface";
import type { ContentVideo } from "../domain/content-video.valueobject";

export async function markContentVideoUploaded(
	videoRepository: ContentVideoRepositoryInterface,
	jobRepository: ContentJobRepositoryInterface,
	input: { id: string; storageKey: string },
): Promise<ContentVideo> {
	const video = await videoRepository.markUploaded(input);
	await jobRepository.enqueue({
		videoId: input.id,
		type: "transcribe-video",
		payload: {
			storageKey: input.storageKey,
		},
	});

	return video;
}
