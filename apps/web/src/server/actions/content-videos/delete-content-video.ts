"use server";

import { contentClipRepository } from "~/modules/content-clips/infrastructure/content-clip.repository";
import { deleteContentVideo } from "~/modules/content-videos/application/delete-content-video";
import { contentVideoRepository } from "~/modules/content-videos/infrastructure/content-video.repository";
import { requireSession } from "~/server/auth";

type DeleteContentVideoActionResult =
	| {
			success: true;
			data: Awaited<ReturnType<typeof deleteContentVideo>>;
	  }
	| {
			success: false;
			error: string;
	  };

export async function deleteContentVideoAction(input: {
	videoId: string;
}): Promise<DeleteContentVideoActionResult> {
	try {
		await requireSession();
		const result = await deleteContentVideo(
			contentVideoRepository,
			contentClipRepository,
			input,
		);

		return {
			success: true,
			data: result,
		};
	} catch (error) {
		console.error("Failed to delete content video:", error);
		return {
			success: false,
			error:
				error instanceof Error
					? error.message
					: "Failed to delete content video",
		};
	}
}
