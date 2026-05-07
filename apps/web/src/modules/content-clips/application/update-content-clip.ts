import type { ContentClipRepositoryInterface } from "../domain/content-clip.repository.interface";
import {
	type ContentClip,
	type UpdateContentClipInput,
	UpdateContentClipSchema,
} from "../domain/content-clip.valueobject";

export async function updateContentClip(
	clipRepository: ContentClipRepositoryInterface,
	input: UpdateContentClipInput,
): Promise<ContentClip> {
	const validatedInput = UpdateContentClipSchema.parse(input);
	const currentClip = await clipRepository.findById(validatedInput.id);

	if (!currentClip) {
		throw new Error("Clip not found");
	}

	const startSeconds = validatedInput.startSeconds ?? currentClip.startSeconds;
	const endSeconds = validatedInput.endSeconds ?? currentClip.endSeconds;

	if (endSeconds <= startSeconds) {
		throw new Error("Clip end time must be greater than the start time");
	}

	return clipRepository.update({
		...validatedInput,
		startSeconds,
		endSeconds,
	});
}
