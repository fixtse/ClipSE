"use server";

import { queueContentClipRender } from "~/modules/content-clips/application/queue-content-clip-render";
import type { QueueContentClipRenderInput } from "~/modules/content-clips/domain/content-clip.valueobject";
import { contentClipRepository } from "~/modules/content-clips/infrastructure/content-clip.repository";
import { contentJobRepository } from "~/modules/content-jobs/infrastructure/content-job.repository";
import { contentVideoRepository } from "~/modules/content-videos/infrastructure/content-video.repository";
import { requireSession } from "~/server/auth";

type QueueContentClipRenderActionResult =
	| {
			success: true;
			data: Awaited<ReturnType<typeof queueContentClipRender>>;
	  }
	| {
			success: false;
			error: string;
	  };

export async function queueContentClipRenderAction(
	input: {
		clipId: string;
	} & Partial<
		Pick<
			QueueContentClipRenderInput,
			"aspectMode" | "burnSubtitles" | "focusMode"
		>
	>,
): Promise<QueueContentClipRenderActionResult> {
	try {
		await requireSession();
		const clip = await queueContentClipRender(
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
