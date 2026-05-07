"use server";

import { cancelContentVideoIngest } from "~/modules/content-videos/application/cancel-content-video-ingest";
import { contentVideoRepository } from "~/modules/content-videos/infrastructure/content-video.repository";
import { requireSession } from "~/server/auth";

type CancelContentVideoIngestActionResult =
	| {
			success: true;
			data: Awaited<ReturnType<typeof cancelContentVideoIngest>>;
	  }
	| {
			success: false;
			error: string;
	  };

export async function cancelContentVideoIngestAction(input: {
	videoId: string;
}): Promise<CancelContentVideoIngestActionResult> {
	try {
		await requireSession();
		const result = await cancelContentVideoIngest(
			contentVideoRepository,
			input,
		);
		return {
			success: true,
			data: result,
		};
	} catch (error) {
		console.error("Failed to cancel content video ingest:", error);
		return {
			success: false,
			error:
				error instanceof Error
					? error.message
					: "Failed to cancel content video ingest",
		};
	}
}
