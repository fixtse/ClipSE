"use server";

import { deleteClipSE } from "~/modules/content-clips/application/delete-content-clip";
import { contentClipRepository } from "~/modules/content-clips/infrastructure/content-clip.repository";
import { requireSession } from "~/server/auth";

type DeleteClipSEActionResult =
	| {
			success: true;
			data: Awaited<ReturnType<typeof deleteClipSE>>;
	  }
	| {
			success: false;
			error: string;
	  };

export async function deleteClipSEAction(input: {
	clipId: string;
}): Promise<DeleteClipSEActionResult> {
	try {
		await requireSession();
		const result = await deleteClipSE(contentClipRepository, input);
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
