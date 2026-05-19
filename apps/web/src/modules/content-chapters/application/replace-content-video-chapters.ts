import type { ContentChapterRepositoryInterface } from "../domain/content-chapter.repository.interface";
import type {
	ContentChapter,
	GeneratedChapter,
} from "../domain/content-chapter.valueobject";

export async function replaceContentVideoChapters(
	repository: ContentChapterRepositoryInterface,
	videoId: string,
	chapters: GeneratedChapter[],
): Promise<ContentChapter[]> {
	return await repository.replaceForVideo(videoId, chapters);
}
