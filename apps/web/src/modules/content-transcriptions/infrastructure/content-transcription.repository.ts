import { eq } from "drizzle-orm";
import { db } from "~/server/db";
import { contentTranscriptions } from "~/server/db/schema";
import type { ContentTranscriptionRepositoryInterface } from "../domain/content-transcription.repository.interface";
import type {
	ContentTranscription,
	ContentTranscriptionSegment,
	UpsertContentTranscriptionInput,
} from "../domain/content-transcription.valueobject";

export class ContentTranscriptionRepository
	implements ContentTranscriptionRepositoryInterface
{
	async findByVideoId(videoId: string): Promise<ContentTranscription | null> {
		const [transcription] = await db
			.select()
			.from(contentTranscriptions)
			.where(eq(contentTranscriptions.videoId, videoId));

		return transcription ? this.map(transcription) : null;
	}

	async upsert(
		input: UpsertContentTranscriptionInput,
	): Promise<ContentTranscription> {
		const [upserted] = await db
			.insert(contentTranscriptions)
			.values({
				videoId: input.videoId,
				language: input.language,
				provider: input.provider,
				model: input.model,
				segments:
					input.segments as unknown as typeof contentTranscriptions.$inferInsert.segments,
				fullText: input.fullText,
				metadata: (input.metadata ??
					{}) as unknown as typeof contentTranscriptions.$inferInsert.metadata,
				createdAt: new Date(),
				updatedAt: new Date(),
			})
			.onConflictDoUpdate({
				target: contentTranscriptions.videoId,
				set: {
					language: input.language,
					provider: input.provider,
					model: input.model,
					segments:
						input.segments as unknown as typeof contentTranscriptions.$inferInsert.segments,
					fullText: input.fullText,
					metadata: (input.metadata ??
						{}) as unknown as typeof contentTranscriptions.$inferInsert.metadata,
					updatedAt: new Date(),
				},
			})
			.returning();

		if (!upserted) {
			throw new Error("Failed to save transcription");
		}

		return this.map(upserted);
	}

	private map(
		row: typeof contentTranscriptions.$inferSelect,
	): ContentTranscription {
		return {
			id: row.id,
			videoId: row.videoId,
			language: row.language,
			provider: row.provider,
			model: row.model,
			segments: row.segments as unknown as ContentTranscriptionSegment[],
			fullText: row.fullText,
			metadata: row.metadata as Record<string, unknown>,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
		};
	}
}

export const contentTranscriptionRepository =
	new ContentTranscriptionRepository();
