import type {
	ContentClip,
	CreateContentClipInput,
	GeneratedClipCandidate,
	UpdateContentClipInput,
} from "./content-clip.valueobject";

export interface ContentClipRepositoryInterface {
	findById(id: string): Promise<ContentClip | null>;
	listByVideoId(videoId: string): Promise<ContentClip[]>;
	replaceForVideo(
		videoId: string,
		clips: GeneratedClipCandidate[],
	): Promise<ContentClip[]>;
	create(input: CreateContentClipInput): Promise<ContentClip>;
	update(input: UpdateContentClipInput): Promise<ContentClip>;
	delete(id: string): Promise<void>;
	updateStatus(input: {
		id: string;
		status: ContentClip["status"];
		latestError?: string | null;
	}): Promise<ContentClip>;
	attachRenderedAsset(input: {
		id: string;
		outputStorageKey: string;
		outputFilename: string;
	}): Promise<ContentClip>;
	markDownloaded(id: string): Promise<ContentClip>;
}
