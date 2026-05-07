import type {
	ContentAiSettings,
	UpdateContentAiSettingsInput,
} from "./content-ai-settings.valueobject";

export interface ContentAiSettingsRepositoryInterface {
	get(): Promise<ContentAiSettings>;
	update(input: UpdateContentAiSettingsInput): Promise<ContentAiSettings>;
}
