import type { ContentAiSettingsRepositoryInterface } from "../domain/content-ai-settings.repository.interface";
import type { ContentAiSettings } from "../domain/content-ai-settings.valueobject";

export async function getContentAiSettings(
	repository: ContentAiSettingsRepositoryInterface,
): Promise<ContentAiSettings> {
	return repository.get();
}
