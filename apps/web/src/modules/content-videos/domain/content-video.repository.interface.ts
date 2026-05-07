import type {
	ContentVideo,
	CreateContentVideoDraftInput,
	UpdateContentVideoBumperInput,
	UpdateContentVideoInput,
	UpdateContentVideoStageInput,
} from "./content-video.valueobject";

export interface ContentVideoRepositoryInterface {
	createDraft(input: CreateContentVideoDraftInput): Promise<ContentVideo>;
	findById(id: string): Promise<ContentVideo | null>;
	listAll(): Promise<ContentVideo[]>;
	listByChannelId(channelId: string): Promise<ContentVideo[]>;
	update(input: UpdateContentVideoInput): Promise<ContentVideo>;
	updateBumper(input: UpdateContentVideoBumperInput): Promise<ContentVideo>;
	updateStage(input: UpdateContentVideoStageInput): Promise<ContentVideo>;
	markUploaded(input: {
		id: string;
		storageKey: string;
	}): Promise<ContentVideo>;
	markDownloaded(input: {
		id: string;
		originalFilename: string;
		title?: string;
		mimeType: string;
		sizeBytes: number;
		storageKey: string;
	}): Promise<ContentVideo>;
	delete(id: string): Promise<void>;
}
