import type { ContentAiSettingsRepositoryInterface } from "../domain/content-ai-settings.repository.interface";
import {
	type ContentAiSettings,
	type UpdateContentAiSettingsInput,
	UpdateContentAiSettingsSchema,
} from "../domain/content-ai-settings.valueobject";

export async function updateContentAiSettings(
	repository: ContentAiSettingsRepositoryInterface,
	input: UpdateContentAiSettingsInput,
): Promise<ContentAiSettings> {
	const validatedInput = UpdateContentAiSettingsSchema.parse(input);
	return repository.update(validatedInput);
}
