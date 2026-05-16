"use server";

import { queueClipSERender } from "~/modules/content-clips/application/queue-content-clip-render";
import type { QueueClipSERenderInput } from "~/modules/content-clips/domain/content-clip.valueobject";
import { contentClipRepository } from "~/modules/content-clips/infrastructure/content-clip.repository";
import { contentJobRepository } from "~/modules/content-jobs/infrastructure/content-job.repository";
import { contentVideoRepository } from "~/modules/content-videos/infrastructure/content-video.repository";
import { requireSession } from "~/server/auth";

type QueueClipSERenderActionResult =
	| {
			success: true;
			data: Awaited<ReturnType<typeof queueClipSERender>>;
	  }
	| {
			success: false;
			error: string;
	  };

export async function queueClipSERenderAction(
	input: {
		clipId: string;
	} & Partial<
		Pick<QueueClipSERenderInput, "aspectMode" | "burnSubtitles" | "focusMode">
	>,
): Promise<QueueClipSERenderActionResult> {
	try {
		await requireSession();
		const clip = await queueClipSERender(
			contentClipRepository,
			contentVideoRepository,
			contentJobRepository,
			input,
		);
		return {
			success: true,
			data: clip,
		};
	} catch (error) {
		console.error("Failed to queue content clip render:", error);
		return {
			success: false,
			error:
				error instanceof Error
					? error.message
					: "Failed to queue content clip render",
		};
	}
}
