import type { ContentTranscriptionRepositoryInterface } from "../domain/content-transcription.repository.interface";
import type {
	ContentTranscription,
	UpsertContentTranscriptionInput,
} from "../domain/content-transcription.valueobject";

export async function saveContentVideoTranscription(
	repository: ContentTranscriptionRepositoryInterface,
	input: UpsertContentTranscriptionInput,
): Promise<ContentTranscription> {
	return await repository.upsert(input);
}
