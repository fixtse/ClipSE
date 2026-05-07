"use server";

import { updateContentVideo } from "~/modules/content-videos/application/update-content-video";
import type { UpdateContentVideoInput } from "~/modules/content-videos/domain/content-video.valueobject";
import { contentVideoRepository } from "~/modules/content-videos/infrastructure/content-video.repository";
import { requireSession } from "~/server/auth";

type UpdateContentVideoActionResult =
	| {
			success: true;
			data: Awaited<ReturnType<typeof updateContentVideo>>;
	  }
	| {
			success: false;
			error: string;
	  };

export async function updateContentVideoAction(
	input: UpdateContentVideoInput,
): Promise<UpdateContentVideoActionResult> {
	try {
		await requireSession();
		const video = await updateContentVideo(contentVideoRepository, input);
		return {
			success: true,
			data: video,
		};
	} catch (error) {
		console.error("Failed to update content video:", error);
		return {
			success: false,
			error:
				error instanceof Error
					? error.message
					: "Failed to update content video",
		};
	}
}
