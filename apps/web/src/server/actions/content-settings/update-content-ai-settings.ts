"use server";

import { updateContentAiSettings } from "~/modules/content-settings/application/update-content-ai-settings";
import type { UpdateContentAiSettingsInput } from "~/modules/content-settings/domain/content-ai-settings.valueobject";
import { contentAiSettingsRepository } from "~/modules/content-settings/infrastructure/content-ai-settings.repository";
import { requireSession } from "~/server/auth";

type UpdateContentAiSettingsActionResult =
	| {
			success: true;
			data: Awaited<ReturnType<typeof updateContentAiSettings>>;
	  }
	| {
			success: false;
			error: string;
	  };

export async function updateContentAiSettingsAction(
	input: UpdateContentAiSettingsInput,
): Promise<UpdateContentAiSettingsActionResult> {
	try {
		await requireSession();
		const settings = await updateContentAiSettings(
			contentAiSettingsRepository,
			input,
		);
		return {
			success: true,
			data: settings,
		};
	} catch (error) {
		console.error("Failed to update content AI settings:", error);
		return {
			success: false,
			error:
				error instanceof Error
					? error.message
					: "Failed to update content AI settings",
		};
	}
}
