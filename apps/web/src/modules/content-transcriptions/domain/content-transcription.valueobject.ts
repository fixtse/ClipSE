import { z } from "zod";

export const ContentTranscriptionWordSchema = z.object({
	start: z.number().nonnegative(),
	end: z.number().nonnegative(),
	text: z.string().min(1),
});

export type ContentTranscriptionWord = z.infer<
	typeof ContentTranscriptionWordSchema
>;

export const ContentTranscriptionSegmentSchema = z.object({
	start: z.number().nonnegative(),
	end: z.number().nonnegative(),
	text: z.string().min(1),
	words: z.array(ContentTranscriptionWordSchema).optional(),
});

export type ContentTranscriptionSegment = z.infer<
	typeof ContentTranscriptionSegmentSchema
>;

export const ContentTranscriptionSchema = z.object({
	id: z.string().uuid(),
	videoId: z.string().uuid(),
	language: z.string().min(2).max(10),
	provider: z.string().min(1).max(80),
	model: z.string().min(1).max(120),
	segments: z.array(ContentTranscriptionSegmentSchema),
	fullText: z.string().min(1),
	metadata: z.record(z.string(), z.unknown()),
	createdAt: z.date(),
	updatedAt: z.date(),
});

export type ContentTranscription = z.infer<typeof ContentTranscriptionSchema>;

export const UpsertContentTranscriptionSchema = z.object({
	videoId: z.string().uuid(),
	language: z.string().min(2).max(10),
	provider: z.string().min(1).max(80),
	model: z.string().min(1).max(120),
	segments: z.array(ContentTranscriptionSegmentSchema),
	fullText: z.string().min(1),
	metadata: z.record(z.string(), z.unknown()).optional(),
});

export type UpsertContentTranscriptionInput = z.infer<
	typeof UpsertContentTranscriptionSchema
>;

export const UpdateContentTranscriptionSegmentSchema = z.object({
	videoId: z.string().uuid(),
	segmentIndex: z.number().int().nonnegative(),
	text: z.string().trim().min(1),
});

export type UpdateContentTranscriptionSegmentInput = z.infer<
	typeof UpdateContentTranscriptionSegmentSchema
>;

export function formatContentTimestamp(totalSeconds: number): string {
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = Math.floor(totalSeconds % 60);

	if (hours > 0) {
		return `${hours.toString().padStart(2, "0")}:${minutes
			.toString()
			.padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
	}

	return `${minutes.toString().padStart(2, "0")}:${seconds
		.toString()
		.padStart(2, "0")}`;
}
