import type { ContentAiModelOption } from "./content-ai-models";

export function resolveCodexReasoningEffort(
	model: ContentAiModelOption,
	selectedEffort: string | null,
): string | null {
	return selectedEffort &&
		model.supportedReasoningEfforts?.includes(selectedEffort)
		? selectedEffort
		: null;
}
