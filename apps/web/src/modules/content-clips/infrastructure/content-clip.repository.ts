import { and, asc, eq } from "drizzle-orm";
import { db } from "~/server/db";
import { contentClips } from "~/server/db/schema";
import type { ClipSERepositoryInterface } from "../domain/content-clip.repository.interface";
import type {
	ClipSE,
	ClipSEKind,
	CreateClipSEInput,
	GeneratedClipCandidate,
	UpdateClipSEInput,
} from "../domain/content-clip.valueobject";

export class ClipSERepository implements ClipSERepositoryInterface {
	async findById(id: string): Promise<ClipSE | null> {
		const [clip] = await db
			.select()
			.from(contentClips)
			.where(eq(contentClips.id, id));

		return clip ? this.map(clip) : null;
	}

	async listByVideoId(
		videoId: string,
		clipKind?: ClipSEKind,
	): Promise<ClipSE[]> {
		const clips = await db
			.select()
			.from(contentClips)
			.where(
				clipKind
					? and(
							eq(contentClips.videoId, videoId),
							eq(contentClips.clipKind, clipKind),
						)
					: eq(contentClips.videoId, videoId),
			)
			.orderBy(asc(contentClips.orderIndex), asc(contentClips.createdAt));

		return clips.map((clip) => this.map(clip));
	}

	async replaceForVideo(
		videoId: string,
		clips: GeneratedClipCandidate[],
		clipKind: ClipSEKind = "standard",
	): Promise<ClipSE[]> {
		await db
			.delete(contentClips)
			.where(
				and(
					eq(contentClips.videoId, videoId),
					eq(contentClips.clipKind, clipKind),
				),
			);

		if (clips.length === 0) {
			return [];
		}

		await db.insert(contentClips).values(
			clips.map((clip, index) => ({
				videoId,
				clipKind,
				shortDetectionMode: "people",
				orderIndex: index,
				title: clip.title,
				hook: clip.hook,
				summary: clip.summary,
				rationale: clip.rationale,
				transcriptExcerpt: clip.transcriptExcerpt,
				startSeconds: Number(clip.startSeconds.toFixed(3)),
				endSeconds: Number(clip.endSeconds.toFixed(3)),
				score: Math.round(clip.score),
				status: "suggested",
				tags: clip.tags as unknown as typeof contentClips.$inferInsert.tags,
				createdAt: new Date(),
				updatedAt: new Date(),
			})),
		);

		return this.listByVideoId(videoId, clipKind);
	}

	async create(input: CreateClipSEInput): Promise<ClipSE> {
		const clipKind = input.clipKind ?? "standard";
		const shortDetectionMode = input.shortDetectionMode ?? "people";
		const existingClips = await this.listByVideoId(input.videoId, clipKind);
		const orderIndex =
			Math.max(-1, ...existingClips.map((clip) => clip.orderIndex)) + 1;

		const [clip] = await db
			.insert(contentClips)
			.values({
				videoId: input.videoId,
				clipKind,
				shortDetectionMode,
				orderIndex,
				title: input.title.trim(),
				hook: input.hook,
				summary: input.summary,
				rationale: "Manual clip",
				transcriptExcerpt: "",
				startSeconds: Number(input.startSeconds.toFixed(3)),
				endSeconds: Number(input.endSeconds.toFixed(3)),
				score: 50,
				status: "suggested",
				tags: [],
				createdAt: new Date(),
				updatedAt: new Date(),
			})
			.returning();

		if (!clip) {
			throw new Error("Failed to create clip");
		}

		return this.map(clip);
	}

	async update(input: UpdateClipSEInput): Promise<ClipSE> {
		const shouldResetRenderedAsset =
			input.startSeconds !== undefined ||
			input.endSeconds !== undefined ||
			input.shortDetectionMode !== undefined;

		const [updated] = await db
			.update(contentClips)
			.set({
				title: input.title?.trim(),
				hook: input.hook,
				summary: input.summary,
				rationale: input.rationale,
				transcriptExcerpt: input.transcriptExcerpt,
				startSeconds:
					input.startSeconds === undefined
						? undefined
						: Number(input.startSeconds.toFixed(3)),
				endSeconds:
					input.endSeconds === undefined
						? undefined
						: Number(input.endSeconds.toFixed(3)),
				score: input.score === undefined ? undefined : Math.round(input.score),
				tags:
					input.tags === undefined
						? undefined
						: (input.tags as unknown as typeof contentClips.$inferInsert.tags),
				shortDetectionMode: input.shortDetectionMode,
				status: shouldResetRenderedAsset ? "suggested" : undefined,
				outputStorageKey: shouldResetRenderedAsset ? null : undefined,
				outputFilename: shouldResetRenderedAsset ? null : undefined,
				downloadedAt: shouldResetRenderedAsset ? null : undefined,
				latestError: shouldResetRenderedAsset ? null : undefined,
				updatedAt: new Date(),
			})
			.where(eq(contentClips.id, input.id))
			.returning();

		if (!updated) {
			throw new Error("Clip not found");
		}

		return this.map(updated);
	}

	async delete(id: string): Promise<void> {
		await db.delete(contentClips).where(eq(contentClips.id, id));
	}

	async updateStatus(input: {
		id: string;
		status: ClipSE["status"];
		latestError?: string | null;
	}): Promise<ClipSE> {
		const [updated] = await db
			.update(contentClips)
			.set({
				status: input.status,
				downloadedAt:
					input.status === "queued" || input.status === "rendering"
						? null
						: undefined,
				latestError:
					input.latestError === undefined ? undefined : input.latestError,
				updatedAt: new Date(),
			})
			.where(eq(contentClips.id, input.id))
			.returning();

		if (!updated) {
			throw new Error("Clip not found");
		}

		return this.map(updated);
	}

	async attachRenderedAsset(input: {
		id: string;
		outputStorageKey: string;
		outputFilename: string;
	}): Promise<ClipSE> {
		const [updated] = await db
			.update(contentClips)
			.set({
				status: "ready",
				outputStorageKey: input.outputStorageKey,
				outputFilename: input.outputFilename,
				downloadedAt: null,
				latestError: null,
				updatedAt: new Date(),
			})
			.where(eq(contentClips.id, input.id))
			.returning();

		if (!updated) {
			throw new Error("Clip not found");
		}

		return this.map(updated);
	}

	async markDownloaded(id: string): Promise<ClipSE> {
		const [updated] = await db
			.update(contentClips)
			.set({
				downloadedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(contentClips.id, id))
			.returning();

		if (!updated) {
			throw new Error("Clip not found");
		}

		return this.map(updated);
	}

	private map(row: typeof contentClips.$inferSelect): ClipSE {
		return {
			id: row.id,
			videoId: row.videoId,
			clipKind: row.clipKind as ClipSE["clipKind"],
			shortDetectionMode:
				row.shortDetectionMode as ClipSE["shortDetectionMode"],
			orderIndex: row.orderIndex,
			title: row.title,
			hook: row.hook,
			summary: row.summary,
			rationale: row.rationale,
			transcriptExcerpt: row.transcriptExcerpt,
			startSeconds: row.startSeconds,
			endSeconds: row.endSeconds,
			score: row.score,
			status: row.status as ClipSE["status"],
			tags: row.tags as string[],
			outputStorageKey: row.outputStorageKey ?? null,
			outputFilename: row.outputFilename ?? null,
			downloadedAt: row.downloadedAt ?? null,
			latestError: row.latestError ?? null,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
		};
	}
}

export const contentClipRepository = new ClipSERepository();
