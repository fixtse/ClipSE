import type { ContentVideoRepositoryInterface } from "~/modules/content-videos/domain/content-video.repository.interface";
import type { ContentClipRepositoryInterface } from "../domain/content-clip.repository.interface";
import {
	type ContentClip,
	type CreateContentClipInput,
	CreateContentClipSchema,
} from "../domain/content-clip.valueobject";

export async function createContentClip(
	clipRepository: ContentClipRepositoryInterface,
	videoRepository: ContentVideoRepositoryInterface,
	input: CreateContentClipInput,
): Promise<ContentClip> {
	const validatedInput = CreateContentClipSchema.parse(input);
	const video = await videoRepository.findById(validatedInput.videoId);
	if (!video) {
		throw new Error("Video not found");
	}

	if (validatedInput.endSeconds <= validatedInput.startSeconds) {
		throw new Error("Clip end time must be greater than the start time");
	}

	if (
		video.durationSeconds &&
		validatedInput.endSeconds > video.durationSeconds
	) {
		throw new Error("Clip end time exceeds source duration");
	}

	return clipRepository.create(validatedInput);
}
