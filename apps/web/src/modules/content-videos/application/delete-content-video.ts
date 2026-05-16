import type { ClipSERepositoryInterface } from "~/modules/content-clips/domain/content-clip.repository.interface";
import { deleteCachedMediaFile } from "~/server/lib/clipse-local-media";
import { deleteStorageObject } from "~/server/lib/clipse-storage";
import type { ContentVideoRepositoryInterface } from "../domain/content-video.repository.interface";

export async function deleteContentVideo(
	videoRepository: ContentVideoRepositoryInterface,
	clipRepository: ClipSERepositoryInterface,
	input: {
		videoId: string;
	},
): Promise<{ id: string; deletedAssetCount: number }> {
	const video = await videoRepository.findById(input.videoId);
	if (!video) {
		return { id: input.videoId, deletedAssetCount: 0 };
	}

	const clips = await clipRepository.listByVideoId(input.videoId);
	const storageKeys = [
		video.storageKey,
		...clips.map((clip) => clip.outputStorageKey),
	].filter(Boolean) as string[];
	const uniqueStorageKeys = [...new Set(storageKeys)];

	await Promise.all(
		uniqueStorageKeys.map(async (storageKey) => {
			await Promise.all([
				deleteStorageObject(storageKey).catch((error: unknown) => {
					console.warn("Failed to delete storage object:", storageKey, error);
				}),
				deleteCachedMediaFile(storageKey).catch((error: unknown) => {
					console.warn(
						"Failed to delete cached media file:",
						storageKey,
						error,
					);
				}),
			]);
		}),
	);

	await videoRepository.delete(input.videoId);

	return {
		id: input.videoId,
		deletedAssetCount: uniqueStorageKeys.length,
	};
}
