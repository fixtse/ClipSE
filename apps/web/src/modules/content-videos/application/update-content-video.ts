import type { ContentVideoRepositoryInterface } from "../domain/content-video.repository.interface";
import {
	type ContentVideo,
	type UpdateContentVideoInput,
	UpdateContentVideoSchema,
} from "../domain/content-video.valueobject";

export async function updateContentVideo(
	videoRepository: ContentVideoRepositoryInterface,
	input: UpdateContentVideoInput,
): Promise<ContentVideo> {
	const validatedInput = UpdateContentVideoSchema.parse(input);
	return videoRepository.update(validatedInput);
}
