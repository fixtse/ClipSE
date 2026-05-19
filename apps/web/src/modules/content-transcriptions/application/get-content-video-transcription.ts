import type { ContentTranscriptionRepositoryInterface } from "../domain/content-transcription.repository.interface";
import type { ContentTranscription } from "../domain/content-transcription.valueobject";

export async function getContentVideoTranscription(
	repository: ContentTranscriptionRepositoryInterface,
	videoId: string,
): Promise<ContentTranscription | null> {
	return await repository.findByVideoId(videoId);
}
