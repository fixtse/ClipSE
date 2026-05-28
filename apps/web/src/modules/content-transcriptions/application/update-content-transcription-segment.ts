import type { ContentTranscriptionRepositoryInterface } from "../domain/content-transcription.repository.interface";
import type {
	ContentTranscription,
	UpdateContentTranscriptionSegmentInput,
} from "../domain/content-transcription.valueobject";
import { UpdateContentTranscriptionSegmentSchema } from "../domain/content-transcription.valueobject";

export async function updateContentTranscriptionSegment(
	repository: ContentTranscriptionRepositoryInterface,
	input: UpdateContentTranscriptionSegmentInput,
): Promise<ContentTranscription> {
	const parsedInput = UpdateContentTranscriptionSegmentSchema.parse(input);
	const transcription = await repository.findByVideoId(parsedInput.videoId);

	if (!transcription) {
		throw new Error("Transcription not found");
	}

	if (!transcription.segments[parsedInput.segmentIndex]) {
		throw new Error("Transcript segment not found");
	}

	const segments = transcription.segments.map((currentSegment, index) =>
		index === parsedInput.segmentIndex
			? {
					start: currentSegment.start,
					end: currentSegment.end,
					text: parsedInput.text,
				}
			: currentSegment,
	);

	return await repository.upsert({
		videoId: transcription.videoId,
		language: transcription.language,
		provider: transcription.provider,
		model: transcription.model,
		segments,
		fullText: segments.map((currentSegment) => currentSegment.text).join(" "),
		metadata: transcription.metadata,
	});
}
