"use server";

import { queueContentVideoClipRenders } from "~/modules/content-clips/application/queue-content-video-clip-renders";
import { contentClipRepository } from "~/modules/content-clips/infrastructure/content-clip.repository";
import { contentJobRepository } from "~/modules/content-jobs/infrastructure/content-job.repository";
import { contentVideoRepository } from "~/modules/content-videos/infrastructure/content-video.repository";
import { requireSession } from "~/server/auth";

type QueueContentVideoClipRendersActionResult =
	| {
			success: true;
			data: Awaited<ReturnType<typeof queueContentVideoClipRenders>>;
	  }
	| {
			success: false;
			error: string;
	  };

export async function queueContentVideoClipRendersAction(input: {
	videoId: string;
}): Promise<QueueContentVideoClipRendersActionResult> {
	try {
		await requireSession();
		const result = await queueContentVideoClipRenders(
			contentClipRepository,
			contentVideoRepository,
			contentJobRepository,
			input,
		);
		return {
			success: true,
			data: result,
		};
	} catch (error) {
		console.error("Failed to queue content video clip renders:", error);
		return {
			success: false,
			error:
				error instanceof Error
					? error.message
					: "Failed to queue content video clip renders",
		};
	}
}
