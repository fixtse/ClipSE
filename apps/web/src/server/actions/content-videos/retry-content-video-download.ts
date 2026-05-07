"use server";

import { contentJobRepository } from "~/modules/content-jobs/infrastructure/content-job.repository";
import { retryContentVideoDownload } from "~/modules/content-videos/application/retry-content-video-download";
import { contentVideoRepository } from "~/modules/content-videos/infrastructure/content-video.repository";
import { requireSession } from "~/server/auth";

type RetryContentVideoDownloadActionResult =
	| {
			success: true;
			data: Awaited<ReturnType<typeof retryContentVideoDownload>>;
	  }
	| {
			success: false;
			error: string;
	  };

export async function retryContentVideoDownloadAction(input: {
	videoId: string;
}): Promise<RetryContentVideoDownloadActionResult> {
	try {
		await requireSession();
		const video = await retryContentVideoDownload(
			contentVideoRepository,
			contentJobRepository,
			input,
		);

		return {
			success: true,
			data: video,
		};
	} catch (error) {
		console.error("Failed to retry content video download:", error);
		return {
			success: false,
			error:
				error instanceof Error
					? error.message
					: "Failed to retry content video download",
		};
	}
}
