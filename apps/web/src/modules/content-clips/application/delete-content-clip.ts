import type { ClipSERepositoryInterface } from "../domain/content-clip.repository.interface";

export async function deleteClipSE(
	clipRepository: ClipSERepositoryInterface,
	input: {
		clipId: string;
	},
): Promise<{ id: string }> {
	const clip = await clipRepository.findById(input.clipId);
	if (!clip) {
		return { id: input.clipId };
	}

	if (clip.status === "queued" || clip.status === "rendering") {
		throw new Error("Queued or rendering clips cannot be deleted.");
	}

	await clipRepository.delete(input.clipId);

	return { id: input.clipId };
}
