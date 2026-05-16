"use server";

import { createClipSE } from "~/modules/content-clips/application/create-content-clip";
import type { CreateClipSEInput } from "~/modules/content-clips/domain/content-clip.valueobject";
import { contentClipRepository } from "~/modules/content-clips/infrastructure/content-clip.repository";
import { contentVideoRepository } from "~/modules/content-videos/infrastructure/content-video.repository";
import { requireSession } from "~/server/auth";

type CreateClipSEActionResult =
	| {
			success: true;
			data: Awaited<ReturnType<typeof createClipSE>>;
	  }
	| {
			success: false;
			error: string;
	  };

export async function createClipSEAction(
	input: CreateClipSEInput,
): Promise<CreateClipSEActionResult> {
	try {
		await requireSession();
		const clip = await createClipSE(
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
