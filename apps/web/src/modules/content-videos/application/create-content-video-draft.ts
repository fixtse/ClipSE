import type { ContentVideoRepositoryInterface } from "../domain/content-video.repository.interface";
import {
	type ContentVideo,
	type CreateContentVideoDraftInput,
	CreateContentVideoDraftSchema,
	resolveSourceMimeType,
} from "../domain/content-video.valueobject";

export async function createContentVideoDraft(
	videoRepository: ContentVideoRepositoryInterface,
	input: CreateContentVideoDraftInput,
): Promise<ContentVideo> {
	const validatedInput = CreateContentVideoDraftSchema.parse(input);
	return videoRepository.createDraft({
		...validatedInput,
		mimeType: resolveSourceMimeType({
			filename: validatedInput.originalFilename,
			mimeType: validatedInput.mimeType,
		}),
	});
}
