import type { ClipSERepositoryInterface } from "../domain/content-clip.repository.interface";
import {
	type ClipSE,
	type UpdateClipSEInput,
	UpdateClipSESchema,
} from "../domain/content-clip.valueobject";

export async function updateClipSE(
	clipRepository: ClipSERepositoryInterface,
	input: UpdateClipSEInput,
): Promise<ClipSE> {
	const validatedInput = UpdateClipSESchema.parse(input);
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
