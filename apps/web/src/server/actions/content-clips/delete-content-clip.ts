"use server";

import { deleteContentClip } from "~/modules/content-clips/application/delete-content-clip";
import { contentClipRepository } from "~/modules/content-clips/infrastructure/content-clip.repository";
import { requireSession } from "~/server/auth";

type DeleteContentClipActionResult =
	| {
			success: true;
			data: Awaited<ReturnType<typeof deleteContentClip>>;
	  }
	| {
			success: false;
			error: string;
	  };

export async function deleteContentClipAction(input: {
	clipId: string;
}): Promise<DeleteContentClipActionResult> {
	try {
		await requireSession();
		const result = await deleteContentClip(contentClipRepository, input);
		return {
			success: true,
			data: result,
		};
	} catch (error) {
		console.error("Failed to delete content clip:", error);
		return {
			success: false,
			error:
				error instanceof Error
					? error.message
					: "Failed to delete content clip",
		};
	}
}
