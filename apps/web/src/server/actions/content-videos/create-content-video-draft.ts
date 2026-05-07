"use server";

import { createContentVideoDraft } from "~/modules/content-videos/application/create-content-video-draft";
import type { CreateContentVideoDraftInput } from "~/modules/content-videos/domain/content-video.valueobject";
import { contentVideoRepository } from "~/modules/content-videos/infrastructure/content-video.repository";
import { requireSession } from "~/server/auth";

type CreateContentVideoDraftActionResult =
	| {
			success: true;
			data: Awaited<ReturnType<typeof createContentVideoDraft>>;
	  }
	| {
			success: false;
			error: string;
	  };

export async function createContentVideoDraftAction(
	input: CreateContentVideoDraftInput,
): Promise<CreateContentVideoDraftActionResult> {
	try {
		await requireSession();
		if (!input.channelId) {
			return {
				success: false,
				error: "Create a channel before adding a source.",
			};
		}

		const video = await createContentVideoDraft(contentVideoRepository, {
			...input,
		});
		return {
			success: true,
			data: video,
		};
	} catch (error) {
		console.error("Failed to create content video draft:", error);
		return {
			success: false,
			error:
				error instanceof Error
					? error.message
					: "Failed to create content video draft",
		};
	}
}
