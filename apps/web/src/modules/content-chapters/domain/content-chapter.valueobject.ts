import { z } from "zod";

export const ContentChapterSchema = z.object({
	id: z.string().uuid(),
	videoId: z.string().uuid(),
	orderIndex: z.number().int().nonnegative(),
	title: z.string().min(1).max(120),
	startSeconds: z.number().nonnegative(),
	endSeconds: z.number().positive(),
	summary: z.string().max(2000),
	relatedClipIndexes: z.array(z.number().int().nonnegative()),
	confidence: z.number().min(0).max(1),
	createdAt: z.date(),
	updatedAt: z.date(),
});

export type ContentChapter = z.infer<typeof ContentChapterSchema>;

export const GeneratedChapterSchema = z.object({
	title: z.string().min(1).max(120),
	startSeconds: z.number().nonnegative(),
	endSeconds: z.number().positive(),
	summary: z.string().max(2000).default(""),
	relatedClipIndexes: z.array(z.number().int().nonnegative()).default([]),
	confidence: z.number().min(0).max(1).default(0.7),
});

export type GeneratedChapter = z.infer<typeof GeneratedChapterSchema>;
