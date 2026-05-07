import type {
	ContentChapter,
	GeneratedChapter,
} from "./content-chapter.valueobject";

export interface ContentChapterRepositoryInterface {
	listByVideoId(videoId: string): Promise<ContentChapter[]>;
	replaceForVideo(
		videoId: string,
		chapters: GeneratedChapter[],
	): Promise<ContentChapter[]>;
}
