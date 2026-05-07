"use server";

import { contentJobRepository } from "~/modules/content-jobs/infrastructure/content-job.repository";
import { createContentVideoUrlSource } from "~/modules/content-videos/application/create-content-video-url-source";
import { contentVideoRepository } from "~/modules/content-videos/infrastructure/content-video.repository";
import { requireSession } from "~/server/auth";

type CreateContentVideoUrlSourceActionResult =
	| {
			success: true;
			data: Awaited<ReturnType<typeof createContentVideoUrlSource>>;
	  }
	| {
			success: false;
			error: string;
	  };

export async function createContentVideoUrlSourceAction(input: {
	channelId?: string;
	sourceUrl: string;
	title?: string;
	analysisPrompt?: string;
	languageHint?: string;
}): Promise<CreateContentVideoUrlSourceActionResult> {
	try {
		await requireSession();
		if (!input.channelId) {
			return {
				success: false,
				error: "Create a channel before adding a source.",
			};
		}

		const video = await createContentVideoUrlSource(
			contentVideoRepository,
			contentJobRepository,
			{
				...input,
			},
		);
		return {
			success: true,
			data: video,
		};
	} catch (error) {
		console.error("Failed to create URL source:", error);
		return {
			success: false,
			error:
				error instanceof Error ? error.message : "Failed to create URL source",
		};
	}
}
