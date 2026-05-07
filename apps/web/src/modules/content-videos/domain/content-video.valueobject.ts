import { z } from "zod";

export const CONTENT_VIDEO_STAGES = [
	"uploading",
	"queued",
	"transcribing",
	"analyzing",
	"ready",
	"failed",
] as const;

export type ContentVideoStage = (typeof CONTENT_VIDEO_STAGES)[number];
export const CONTENT_VIDEO_SOURCE_TYPES = ["file", "url"] as const;
export type ContentVideoSourceType =
	(typeof CONTENT_VIDEO_SOURCE_TYPES)[number];

export const ContentVideoSchema = z.object({
	id: z.string().uuid(),
	channelId: z.string().uuid().nullable(),
	originalFilename: z.string().min(1).max(255),
	title: z.string().min(1).max(255),
	analysisPrompt: z.string().max(4000),
	sourceType: z.enum(CONTENT_VIDEO_SOURCE_TYPES),
	sourceUrl: z.string().url().nullable(),
	languageHint: z.string().min(2).max(10),
	detectedLanguage: z.string().min(2).max(10).nullable(),
	storageKey: z.string().min(1).nullable(),
	introStorageKey: z.string().min(1).nullable(),
	introMimeType: z.string().min(1).max(120).nullable(),
	outroStorageKey: z.string().min(1).nullable(),
	outroMimeType: z.string().min(1).max(120).nullable(),
	mimeType: z.string().min(1).max(120),
	sizeBytes: z.number().int().positive(),
	durationSeconds: z.number().int().positive().nullable(),
	frameRate: z.number().positive().nullable(),
	waveformSamples: z.array(z.number().min(0).max(1)),
	processingStage: z.enum(CONTENT_VIDEO_STAGES),
	latestError: z.string().nullable(),
	uploadCompletedAt: z.date().nullable(),
	createdAt: z.date(),
	updatedAt: z.date(),
});

export type ContentVideo = z.infer<typeof ContentVideoSchema>;

export const CreateContentVideoDraftSchema = z.object({
	channelId: z.string().uuid().optional(),
	originalFilename: z.string().min(1).max(255),
	title: z.string().min(1).max(255).optional(),
	analysisPrompt: z.string().max(4000).optional(),
	sourceType: z.enum(CONTENT_VIDEO_SOURCE_TYPES).optional(),
	sourceUrl: z.string().url().optional(),
	languageHint: z.string().min(2).max(10).optional(),
	mimeType: z
		.string()
		.regex(/^video\//)
		.optional(),
	sizeBytes: z.number().int().positive(),
});

export type CreateContentVideoDraftInput = z.infer<
	typeof CreateContentVideoDraftSchema
>;

export const UpdateContentVideoSchema = z.object({
	id: z.string().uuid(),
	title: z.string().min(1).max(255).optional(),
	analysisPrompt: z.string().max(4000).optional(),
	languageHint: z.string().min(2).max(10).optional(),
});

export type UpdateContentVideoInput = z.infer<typeof UpdateContentVideoSchema>;

export const UpdateContentVideoBumperSchema = z.object({
	id: z.string().uuid(),
	position: z.enum(["intro", "outro"]),
	storageKey: z.string().min(1).nullable(),
	mimeType: z.string().min(1).max(120).nullable(),
});

export type UpdateContentVideoBumperInput = z.infer<
	typeof UpdateContentVideoBumperSchema
>;

export const UpdateContentVideoStageSchema = z.object({
	id: z.string().uuid(),
	processingStage: z.enum(CONTENT_VIDEO_STAGES),
	detectedLanguage: z.string().min(2).max(10).optional().nullable(),
	durationSeconds: z.number().int().positive().optional().nullable(),
	frameRate: z.number().positive().optional().nullable(),
	waveformSamples: z.array(z.number().min(0).max(1)).optional(),
	latestError: z.string().optional().nullable(),
});

export type UpdateContentVideoStageInput = z.infer<
	typeof UpdateContentVideoStageSchema
>;

export function buildVideoTitle(
	originalFilename: string,
	title?: string,
): string {
	const normalizedTitle = title?.trim();
	if (normalizedTitle) {
		return normalizedTitle;
	}

	const withoutExtension = originalFilename.replace(/\.[^.]+$/, "");
	return withoutExtension.trim() || "Untitled upload";
}

export function buildSourceStorageKey(
	videoId: string,
	filename: string,
): string {
	const sanitizedFilename = filename
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");

	return `videos/${videoId}/${sanitizedFilename || "source.mp4"}`;
}

export function buildBumperStorageKey(
	videoId: string,
	position: "intro" | "outro",
	filename: string,
): string {
	const sanitizedFilename = filename
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");

	return `videos/${videoId}/bumpers/${position}-${sanitizedFilename || "video.mp4"}`;
}
