import type {
	ClipSE,
	ClipSEKind,
	CreateClipSEInput,
	GeneratedClipCandidate,
	UpdateClipSEInput,
} from "./content-clip.valueobject";

export interface ClipSERepositoryInterface {
	findById(id: string): Promise<ClipSE | null>;
	listByVideoId(videoId: string, clipKind?: ClipSEKind): Promise<ClipSE[]>;
	replaceForVideo(
		videoId: string,
		clips: GeneratedClipCandidate[],
		clipKind?: ClipSEKind,
	): Promise<ClipSE[]>;
	create(input: CreateClipSEInput): Promise<ClipSE>;
	update(input: UpdateClipSEInput): Promise<ClipSE>;
	delete(id: string): Promise<void>;
	updateStatus(input: {
		id: string;
		status: ClipSE["status"];
		latestError?: string | null;
	}): Promise<ClipSE>;
	attachRenderedAsset(input: {
		id: string;
		outputStorageKey: string;
		outputFilename: string;
	}): Promise<ClipSE>;
	markDownloaded(id: string): Promise<ClipSE>;
}
