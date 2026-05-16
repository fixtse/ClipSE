import type { ContentVideoRepositoryInterface } from "~/modules/content-videos/domain/content-video.repository.interface";
import type { ClipSERepositoryInterface } from "../domain/content-clip.repository.interface";
import {
	type ClipSE,
	type CreateClipSEInput,
	CreateClipSESchema,
} from "../domain/content-clip.valueobject";

export async function createClipSE(
	clipRepository: ClipSERepositoryInterface,
	videoRepository: ContentVideoRepositoryInterface,
	input: CreateClipSEInput,
): Promise<ClipSE> {
	const validatedInput = CreateClipSESchema.parse(input);
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
