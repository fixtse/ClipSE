"use server";

import { updateContentTranscriptionSegment } from "~/modules/content-transcriptions/application/update-content-transcription-segment";
import type { UpdateContentTranscriptionSegmentInput } from "~/modules/content-transcriptions/domain/content-transcription.valueobject";
import { contentTranscriptionRepository } from "~/modules/content-transcriptions/infrastructure/content-transcription.repository";
import { requireSession } from "~/server/auth";

type UpdateContentTranscriptionSegmentActionResult =
	| {
			success: true;
			data: Awaited<ReturnType<typeof updateContentTranscriptionSegment>>;
	  }
	| {
			success: false;
			error: string;
	  };

export async function updateContentTranscriptionSegmentAction(
	input: UpdateContentTranscriptionSegmentInput,
): Promise<UpdateContentTranscriptionSegmentActionResult> {
	try {
		await requireSession();
		const transcription = await updateContentTranscriptionSegment(
			contentTranscriptionRepository,
			input,
		);

		return {
			success: true,
			data: transcription,
		};
	} catch (error) {
		console.error("Failed to update transcript segment:", error);
		return {
			success: false,
			error:
				error instanceof Error
					? error.message
					: "Failed to update transcript segment",
		};
	}
}
