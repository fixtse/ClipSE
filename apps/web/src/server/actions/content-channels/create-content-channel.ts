"use server";

import { createContentChannel } from "~/modules/content-channels/application/create-content-channel";
import { buildChannelLogoStorageKey } from "~/modules/content-channels/domain/content-channel.valueobject";
import { contentChannelRepository } from "~/modules/content-channels/infrastructure/content-channel.repository";
import { requireSession } from "~/server/auth";
import {
	deleteStorageObject,
	uploadWebFileToStorage,
} from "~/server/lib/contentclip-storage";

type CreateContentChannelActionResult =
	| {
			success: true;
			data: Awaited<ReturnType<typeof createContentChannel>>;
	  }
	| {
			success: false;
			error: string;
	  };

export async function createContentChannelAction(
	formData: FormData,
): Promise<CreateContentChannelActionResult> {
	let logoStorageKey: string | null = null;

	try {
		await requireSession();
		const name = String(formData.get("name") ?? "").trim();
		const logo = formData.get("logo");

		if (!name) {
			return { success: false, error: "Channel name is required" };
		}

		if (
			logo instanceof File &&
			logo.size > 0 &&
			!logo.type.startsWith("image/")
		) {
			return { success: false, error: "Channel logo must be an image file" };
		}

		const channel = await createContentChannel(contentChannelRepository, {
			name,
		});

		if (logo instanceof File && logo.size > 0) {
			logoStorageKey = buildChannelLogoStorageKey(channel.id, logo.name);
			await uploadWebFileToStorage({
				key: logoStorageKey,
				file: logo,
				contentType: logo.type || "image/png",
			});
		}

		if (!logoStorageKey) {
			return { success: true, data: channel };
		}

		const updatedChannel = await contentChannelRepository.updateLogo({
			id: channel.id,
			storageKey: logoStorageKey,
			mimeType: logo instanceof File ? logo.type || "image/png" : "image/png",
		});

		return { success: true, data: updatedChannel };
	} catch (error) {
		if (logoStorageKey) {
			await deleteStorageObject(logoStorageKey).catch(() => undefined);
		}
		console.error("Failed to create content channel:", error);
		return {
			success: false,
			error:
				error instanceof Error
					? error.message
					: "Failed to create content channel",
		};
	}
}
