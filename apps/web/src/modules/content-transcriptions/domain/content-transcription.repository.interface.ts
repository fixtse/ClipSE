import type {
	ContentTranscription,
	UpsertContentTranscriptionInput,
} from "./content-transcription.valueobject";

export interface ContentTranscriptionRepositoryInterface {
	findByVideoId(videoId: string): Promise<ContentTranscription | null>;
	upsert(input: UpsertContentTranscriptionInput): Promise<ContentTranscription>;
}
