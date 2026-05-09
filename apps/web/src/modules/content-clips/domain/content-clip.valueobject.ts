import { z } from "zod";

export const CONTENT_CLIP_STATUSES = [
	"suggested",
	"queued",
	"rendering",
	"ready",
	"failed",
] as const;

export type ContentClipStatus = (typeof CONTENT_CLIP_STATUSES)[number];

export const CONTENT_CLIP_KINDS = ["standard", "short"] as const;
export type ContentClipKind = (typeof CONTENT_CLIP_KINDS)[number];

export const CONTENT_CLIP_SHORT_DETECTION_MODES = [
	"people",
	"people_and_screen",
	"screen_only",
	"product_view",
] as const;
export type ContentClipShortDetectionMode =
	(typeof CONTENT_CLIP_SHORT_DETECTION_MODES)[number];

export const ContentClipSchema = z.object({
	id: z.string().uuid(),
	videoId: z.string().uuid(),
	clipKind: z.enum(CONTENT_CLIP_KINDS),
	shortDetectionMode: z.enum(CONTENT_CLIP_SHORT_DETECTION_MODES),
	orderIndex: z.number().int().nonnegative(),
	title: z.string().min(1).max(255),
	hook: z.string().max(1000),
	summary: z.string().max(2000),
	rationale: z.string().max(2000),
	transcriptExcerpt: z.string().max(6000),
	startSeconds: z.number().nonnegative(),
	endSeconds: z.number().positive(),
	score: z.number().int().min(0).max(100),
	status: z.enum(CONTENT_CLIP_STATUSES),
	tags: z.array(z.string().min(1).max(40)).max(10),
	outputStorageKey: z.string().nullable(),
	outputFilename: z.string().nullable(),
	downloadedAt: z.date().nullable(),
	latestError: z.string().nullable(),
	createdAt: z.date(),
	updatedAt: z.date(),
});

export type ContentClip = z.infer<typeof ContentClipSchema>;

export const GeneratedClipCandidateSchema = z.object({
	title: z.string().min(1).max(255),
	hook: z.string().max(1000).default(""),
	summary: z.string().max(2000).default(""),
	rationale: z.string().max(2000).default(""),
	transcriptExcerpt: z.string().max(6000).default(""),
	startSeconds: z.number().nonnegative(),
	endSeconds: z.number().positive(),
	score: z.number().min(0).max(100).default(70),
	tags: z.array(z.string().min(1).max(40)).max(10).default([]),
});

export type GeneratedClipCandidate = z.infer<
	typeof GeneratedClipCandidateSchema
>;

export const CreateContentClipSchema = z.object({
	videoId: z.string().uuid(),
	clipKind: z.enum(CONTENT_CLIP_KINDS).default("standard"),
	shortDetectionMode: z
		.enum(CONTENT_CLIP_SHORT_DETECTION_MODES)
		.default("people"),
	title: z.string().min(1).max(255),
	hook: z.string().max(1000).default(""),
	summary: z.string().max(2000).default(""),
	startSeconds: z.number().nonnegative(),
	endSeconds: z.number().positive(),
});

export type CreateContentClipInput = z.input<typeof CreateContentClipSchema>;

export const UpdateContentClipSchema = z.object({
	id: z.string().uuid(),
	title: z.string().min(1).max(255).optional(),
	hook: z.string().max(1000).optional(),
	summary: z.string().max(2000).optional(),
	rationale: z.string().max(2000).optional(),
	transcriptExcerpt: z.string().max(6000).optional(),
	startSeconds: z.number().nonnegative().optional(),
	endSeconds: z.number().positive().optional(),
	score: z.number().int().min(0).max(100).optional(),
	tags: z.array(z.string().min(1).max(40)).max(10).optional(),
	shortDetectionMode: z.enum(CONTENT_CLIP_SHORT_DETECTION_MODES).optional(),
});

export type UpdateContentClipInput = z.infer<typeof UpdateContentClipSchema>;

export const CONTENT_CLIP_RENDER_ASPECT_MODES = [
	"source",
	"vertical9x16",
] as const;

export const CONTENT_CLIP_RENDER_FOCUS_MODES = ["auto-speaker"] as const;

export type ContentClipRenderAspectMode =
	(typeof CONTENT_CLIP_RENDER_ASPECT_MODES)[number];
export type ContentClipRenderFocusMode =
	(typeof CONTENT_CLIP_RENDER_FOCUS_MODES)[number];

const ContentClipRenderOptionsBaseSchema = z.object({
	aspectMode: z.enum(CONTENT_CLIP_RENDER_ASPECT_MODES).default("source"),
	burnSubtitles: z.boolean().default(false),
	focusMode: z.enum(CONTENT_CLIP_RENDER_FOCUS_MODES).optional(),
});

export const ContentClipRenderOptionsSchema =
	ContentClipRenderOptionsBaseSchema.transform((options) => ({
		...options,
		focusMode:
			options.aspectMode === "vertical9x16"
				? (options.focusMode ?? "auto-speaker")
				: options.focusMode,
	}));

export type ContentClipRenderOptions = z.infer<
	typeof ContentClipRenderOptionsSchema
>;

export const QueueContentClipRenderInputSchema = z.object({
	clipId: z.string().uuid(),
	...ContentClipRenderOptionsBaseSchema.shape,
});

export type QueueContentClipRenderInput = z.input<
	typeof QueueContentClipRenderInputSchema
>;

export const QueueContentVideoClipRendersInputSchema = z.object({
	videoId: z.string().uuid(),
	clipKind: z.enum(CONTENT_CLIP_KINDS).optional(),
	...ContentClipRenderOptionsBaseSchema.shape,
});

export type QueueContentVideoClipRendersInput = z.input<
	typeof QueueContentVideoClipRendersInputSchema
>;

export function parseContentClipRenderOptions(input: {
	aspectMode?: unknown;
	burnSubtitles?: unknown;
	focusMode?: unknown;
}): ContentClipRenderOptions {
	return ContentClipRenderOptionsSchema.parse(input);
}

export function normalizeClipCandidate(
	input: GeneratedClipCandidate,
	videoDurationSeconds: number | null,
): GeneratedClipCandidate {
	const minDurationSeconds = 20;
	const maxEnd = videoDurationSeconds ?? Number.MAX_SAFE_INTEGER;
	const safeStart = Math.max(0, Number(input.startSeconds.toFixed(3)));
	const requestedEnd = Number(input.endSeconds.toFixed(3));
	const safeEnd = Math.min(
		Math.max(requestedEnd, safeStart + minDurationSeconds),
		maxEnd,
	);

	return {
		...input,
		startSeconds: safeStart,
		endSeconds: Number(safeEnd.toFixed(3)),
		score: Math.round(input.score),
	};
}

export function getClipDurationSeconds(clip: {
	startSeconds: number;
	endSeconds: number;
}): number {
	return Math.max(0, clip.endSeconds - clip.startSeconds);
}
