import { z } from "zod";

export const CONTENT_JOB_TYPES = [
	"download-source",
	"transcribe-video",
	"analyze-video",
	"render-clip",
] as const;

export const CONTENT_JOB_STATUSES = [
	"pending",
	"running",
	"completed",
	"failed",
] as const;

export type ContentJobType = (typeof CONTENT_JOB_TYPES)[number];
export type ContentJobStatus = (typeof CONTENT_JOB_STATUSES)[number];

export const ContentJobSchema = z.object({
	id: z.string().uuid(),
	videoId: z.string().uuid().nullable(),
	clipId: z.string().uuid().nullable(),
	type: z.enum(CONTENT_JOB_TYPES),
	status: z.enum(CONTENT_JOB_STATUSES),
	progress: z.number().int().min(0).max(100),
	attempts: z.number().int().nonnegative(),
	maxAttempts: z.number().int().positive(),
	payload: z.record(z.string(), z.unknown()),
	result: z.record(z.string(), z.unknown()),
	runnerId: z.string().nullable(),
	lastError: z.string().nullable(),
	startedAt: z.date().nullable(),
	completedAt: z.date().nullable(),
	lockedAt: z.date().nullable(),
	createdAt: z.date(),
	updatedAt: z.date(),
});

export type ContentJob = z.infer<typeof ContentJobSchema>;

export const CreateContentJobSchema = z.object({
	videoId: z.string().uuid().optional(),
	clipId: z.string().uuid().optional(),
	type: z.enum(CONTENT_JOB_TYPES),
	payload: z.record(z.string(), z.unknown()).optional(),
	maxAttempts: z.number().int().positive().optional(),
});

export type CreateContentJobInput = z.infer<typeof CreateContentJobSchema>;
