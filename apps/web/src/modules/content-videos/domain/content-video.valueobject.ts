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

export const SUPPORTED_AUDIO_EXTENSIONS = ["mp3", "wav", "m4a"] as const;
export const SOURCE_FILE_ACCEPT =
	"video/*,.mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a";

const SUPPORTED_AUDIO_MIME_TYPES = new Set([
	"audio/mpeg",
	"audio/mp3",
	"audio/wav",
	"audio/x-wav",
	"audio/wave",
	"audio/vnd.wave",
	"audio/mp4",
	"audio/x-m4a",
]);

export function isSupportedSourceFile(input: {
	readonly filename: string;
	readonly mimeType?: string;
}): boolean {
	const mimeType = input.mimeType?.toLowerCase().split(";", 1)[0]?.trim() ?? "";
	if (
		mimeType.startsWith("video/") ||
		SUPPORTED_AUDIO_MIME_TYPES.has(mimeType)
	) {
		return true;
	}

	const extension = input.filename.toLowerCase().match(/\.([^.]+)$/)?.[1];
	return SUPPORTED_AUDIO_EXTENSIONS.some(
		(supportedExtension) => supportedExtension === extension,
	);
}

export function resolveSourceMimeType(input: {
	readonly filename: string;
	readonly mimeType?: string;
}): string {
	const mimeType = input.mimeType?.trim();
	if (mimeType) {
		return mimeType;
	}

	const extension = input.filename.toLowerCase().match(/\.([^.]+)$/)?.[1];
	if (extension === "mp3") {
		return "audio/mpeg";
	}
	if (extension === "wav") {
		return "audio/wav";
	}
	if (extension === "m4a") {
		return "audio/mp4";
	}

	return "video/mp4";
}

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

export const CreateContentVideoDraftSchema = z
	.object({
		channelId: z.string().uuid().optional(),
		originalFilename: z.string().min(1).max(255),
		title: z.string().min(1).max(255).optional(),
		analysisPrompt: z.string().max(4000).optional(),
		sourceType: z.enum(CONTENT_VIDEO_SOURCE_TYPES).optional(),
		sourceUrl: z.string().url().optional(),
		languageHint: z.string().min(2).max(10).optional(),
		mimeType: z.string().optional(),
		sizeBytes: z.number().int().positive(),
	})
	.refine(
		(input) =>
			isSupportedSourceFile({
				filename: input.originalFilename,
				mimeType: input.mimeType,
			}),
		{
			message: "Source must be a video, MP3, WAV, or M4A file",
			path: ["mimeType"],
		},
	);

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
