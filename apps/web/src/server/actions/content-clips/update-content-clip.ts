"use server";

import { updateContentClip } from "~/modules/content-clips/application/update-content-clip";
import type { UpdateContentClipInput } from "~/modules/content-clips/domain/content-clip.valueobject";
import { contentClipRepository } from "~/modules/content-clips/infrastructure/content-clip.repository";
import { requireSession } from "~/server/auth";

type UpdateContentClipActionResult =
	| {
			success: true;
			data: Awaited<ReturnType<typeof updateContentClip>>;
	  }
	| {
			success: false;
			error: string;
	  };

export async function updateContentClipAction(
	input: UpdateContentClipInput,
): Promise<UpdateContentClipActionResult> {
	try {
		await requireSession();
		const clip = await updateContentClip(contentClipRepository, input);
		return {
			success: true,
			data: clip,
		};
	} catch (error) {
		console.error("Failed to update content clip:", error);
		return {
			success: false,
			error:
				error instanceof Error
					? error.message
					: "Failed to update content clip",
		};
	}
}
