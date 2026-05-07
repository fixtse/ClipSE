import type { ContentJobRepositoryInterface } from "~/modules/content-jobs/domain/content-job.repository.interface";
import type { ContentVideoRepositoryInterface } from "~/modules/content-videos/domain/content-video.repository.interface";
import type { ContentClipRepositoryInterface } from "../domain/content-clip.repository.interface";

export async function queueContentVideoClipRenders(
	clipRepository: ContentClipRepositoryInterface,
	videoRepository: ContentVideoRepositoryInterface,
	jobRepository: ContentJobRepositoryInterface,
	input: {
		videoId: string;
	},
): Promise<{ queuedCount: number }> {
	const video = await videoRepository.findById(input.videoId);
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
				},
			});
		}),
	);

	return { queuedCount: renderableClips.length };
}
