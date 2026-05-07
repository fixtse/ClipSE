import { and, asc, desc, eq, inArray, lt, ne } from "drizzle-orm";
import { db } from "~/server/db";
import { contentJobs } from "~/server/db/schema";
import type { ContentJobRepositoryInterface } from "../domain/content-job.repository.interface";
import type {
	ContentJob,
	CreateContentJobInput,
} from "../domain/content-job.valueobject";

export class ContentJobRepository implements ContentJobRepositoryInterface {
	async enqueue(input: CreateContentJobInput): Promise<ContentJob> {
		const [job] = await db
			.insert(contentJobs)
			.values({
				videoId: input.videoId ?? null,
				clipId: input.clipId ?? null,
				type: input.type,
				status: "pending",
				progress: 0,
				attempts: 0,
				maxAttempts: input.maxAttempts ?? 3,
				payload: (input.payload ??
					{}) as unknown as typeof contentJobs.$inferInsert.payload,
				result: {} as typeof contentJobs.$inferInsert.result,
				createdAt: new Date(),
				updatedAt: new Date(),
			})
			.returning();

		if (!job) {
			throw new Error("Failed to enqueue job");
		}

		return this.map(job);
	}

	async findById(id: string): Promise<ContentJob | null> {
		const [job] = await db
			.select()
			.from(contentJobs)
			.where(eq(contentJobs.id, id));

		return job ? this.map(job) : null;
	}

	async listRecent(limit = 40): Promise<ContentJob[]> {
		const jobs = await db
			.select()
			.from(contentJobs)
			.orderBy(desc(contentJobs.createdAt))
			.limit(limit);

		return jobs.map((job) => this.map(job));
	}

	async listByVideoId(videoId: string): Promise<ContentJob[]> {
		const jobs = await db
			.select()
			.from(contentJobs)
			.where(eq(contentJobs.videoId, videoId))
			.orderBy(desc(contentJobs.createdAt));

		return jobs.map((job) => this.map(job));
	}

	async clearCompletedAndFailedByVideoId(videoId: string): Promise<number> {
		const deleted = await db
			.delete(contentJobs)
			.where(
				and(
					eq(contentJobs.videoId, videoId),
					inArray(contentJobs.status, ["completed", "failed"]),
				),
			)
			.returning({ id: contentJobs.id });

		return deleted.length;
	}

	async claimNextPending(runnerId: string): Promise<ContentJob | null> {
		const [candidate] = await db
			.select()
			.from(contentJobs)
			.where(eq(contentJobs.status, "pending"))
			.orderBy(asc(contentJobs.createdAt))
			.limit(1);

		if (!candidate) {
			return null;
		}

		const [claimed] = await db
			.update(contentJobs)
			.set({
				status: "running",
				progress: 0,
				attempts: candidate.attempts + 1,
				runnerId,
				startedAt: new Date(),
				lockedAt: new Date(),
				lastError: null,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(contentJobs.id, candidate.id),
					eq(contentJobs.status, "pending"),
				),
			)
			.returning();

		return claimed ? this.map(claimed) : null;
	}

	async requeueStaleRunningJobs(input: {
		staleBefore: Date;
		runnerId: string;
	}): Promise<number> {
		const updated = await db
			.update(contentJobs)
			.set({
				status: "pending",
				progress: 0,
				runnerId: null,
				lockedAt: null,
				lastError: null,
				result: {
					message: "Recovered after worker restart",
				} as typeof contentJobs.$inferInsert.result,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(contentJobs.status, "running"),
					lt(contentJobs.updatedAt, input.staleBefore),
					ne(contentJobs.runnerId, input.runnerId),
				),
			)
			.returning({ id: contentJobs.id });

		return updated.length;
	}

	async updateProgress(input: {
		id: string;
		progress: number;
		message?: string;
	}): Promise<ContentJob> {
		const existingJob = await this.findById(input.id);
		if (!existingJob) {
			throw new Error("Job not found");
		}

		const [updated] = await db
			.update(contentJobs)
			.set({
				progress: Math.max(0, Math.min(100, Math.round(input.progress))),
				result: {
					...existingJob.result,
					...(input.message ? { message: input.message } : {}),
				} as typeof contentJobs.$inferInsert.result,
				updatedAt: new Date(),
			})
			.where(eq(contentJobs.id, input.id))
			.returning();

		if (!updated) {
			throw new Error("Job not found");
		}

		return this.map(updated);
	}

	async markCompleted(input: {
		id: string;
		result?: Record<string, unknown>;
	}): Promise<ContentJob> {
		const [updated] = await db
			.update(contentJobs)
			.set({
				status: "completed",
				progress: 100,
				result: (input.result ??
					{}) as unknown as typeof contentJobs.$inferInsert.result,
				completedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(contentJobs.id, input.id))
			.returning();

		if (!updated) {
			throw new Error("Job not found");
		}

		return this.map(updated);
	}

	async markFailed(input: { id: string; error: string }): Promise<ContentJob> {
		const [updated] = await db
			.update(contentJobs)
			.set({
				status: "failed",
				lastError: input.error,
				completedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(contentJobs.id, input.id))
			.returning();

		if (!updated) {
			throw new Error("Job not found");
		}

		return this.map(updated);
	}

	private map(row: typeof contentJobs.$inferSelect): ContentJob {
		return {
			id: row.id,
			videoId: row.videoId ?? null,
			clipId: row.clipId ?? null,
			type: row.type as ContentJob["type"],
			status: row.status as ContentJob["status"],
			progress: row.progress,
			attempts: row.attempts,
			maxAttempts: row.maxAttempts,
			payload: row.payload as Record<string, unknown>,
			result: row.result as Record<string, unknown>,
			runnerId: row.runnerId ?? null,
			lastError: row.lastError ?? null,
			startedAt: row.startedAt ?? null,
			completedAt: row.completedAt ?? null,
			lockedAt: row.lockedAt ?? null,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
		};
	}
}

export const contentJobRepository = new ContentJobRepository();
