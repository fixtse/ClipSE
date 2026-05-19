import type { ContentChapterRepositoryInterface } from "../domain/content-chapter.repository.interface";
import type { ContentChapter } from "../domain/content-chapter.valueobject";

export async function listContentChapters(
	repository: ContentChapterRepositoryInterface,
	videoId: string,
): Promise<ContentChapter[]> {
	return await repository.listByVideoId(videoId);
}
