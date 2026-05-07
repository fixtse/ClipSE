"use server";

import { createContentClip } from "~/modules/content-clips/application/create-content-clip";
import type { CreateContentClipInput } from "~/modules/content-clips/domain/content-clip.valueobject";
import { contentClipRepository } from "~/modules/content-clips/infrastructure/content-clip.repository";
import { contentVideoRepository } from "~/modules/content-videos/infrastructure/content-video.repository";
import { requireSession } from "~/server/auth";

type CreateContentClipActionResult =
	| {
			success: true;
			data: Awaited<ReturnType<typeof createContentClip>>;
	  }
	| {
			success: false;
			error: string;
	  };

export async function createContentClipAction(
	input: CreateContentClipInput,
): Promise<CreateContentClipActionResult> {
	try {
		await requireSession();
		const clip = await createContentClip(
			contentClipRepository,
			contentVideoRepository,
			input,
		);
		return {
			success: true,
			data: clip,
		};
	} catch (error) {
		console.error("Failed to create content clip:", error);
		return {
			success: false,
			error:
				error instanceof Error
					? error.message
					: "Failed to create content clip",
		};
	}
}
