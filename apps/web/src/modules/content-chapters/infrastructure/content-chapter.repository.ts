import { asc, eq } from "drizzle-orm";
import { db } from "~/server/db";
import { contentChapters } from "~/server/db/schema";
import type { ContentChapterRepositoryInterface } from "../domain/content-chapter.repository.interface";
import type {
	ContentChapter,
	GeneratedChapter,
} from "../domain/content-chapter.valueobject";

export class ContentChapterRepository
	implements ContentChapterRepositoryInterface
{
	async listByVideoId(videoId: string): Promise<ContentChapter[]> {
		const chapters = await db
			.select()
			.from(contentChapters)
			.where(eq(contentChapters.videoId, videoId))
			.orderBy(
				asc(contentChapters.orderIndex),
				asc(contentChapters.startSeconds),
			);

		return chapters.map((chapter) => this.map(chapter));
	}

	async replaceForVideo(
		videoId: string,
		chapters: GeneratedChapter[],
	): Promise<ContentChapter[]> {
		await db
			.delete(contentChapters)
			.where(eq(contentChapters.videoId, videoId));

		if (chapters.length === 0) {
			return [];
		}

		await db.insert(contentChapters).values(
			chapters.map((chapter, index) => ({
				videoId,
				orderIndex: index,
				title: chapter.title,
				startSeconds: Number(chapter.startSeconds.toFixed(3)),
				endSeconds: Number(chapter.endSeconds.toFixed(3)),
				summary: chapter.summary,
				relatedClipIndexes:
					chapter.relatedClipIndexes as unknown as typeof contentChapters.$inferInsert.relatedClipIndexes,
				confidence: chapter.confidence,
				createdAt: new Date(),
				updatedAt: new Date(),
			})),
		);

		return this.listByVideoId(videoId);
	}

	private map(row: typeof contentChapters.$inferSelect): ContentChapter {
		return {
			id: row.id,
			videoId: row.videoId,
			orderIndex: row.orderIndex,
			title: row.title,
			startSeconds: row.startSeconds,
			endSeconds: row.endSeconds,
			summary: row.summary,
			relatedClipIndexes: row.relatedClipIndexes as number[],
			confidence: row.confidence,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
		};
	}
}

export const contentChapterRepository = new ContentChapterRepository();
