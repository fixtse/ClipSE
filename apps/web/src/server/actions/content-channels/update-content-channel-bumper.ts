"use server";

import {
	buildChannelBumperStorageKey,
	type ContentChannelBumperPosition,
	ContentChannelBumperPositionSchema,
	UpdateContentChannelBumperSchema,
} from "~/modules/content-channels/domain/content-channel.valueobject";
import { contentChannelRepository } from "~/modules/content-channels/infrastructure/content-channel.repository";
import { requireSession } from "~/server/auth";
import {
	assertStorageObjectExists,
	deleteStorageObject,
	uploadWebFileToStorage,
} from "~/server/lib/contentclip-storage";

type UpdateContentChannelBumperActionResult =
	| {
			success: true;
			data: Awaited<ReturnType<typeof contentChannelRepository.updateBumper>>;
	  }
	| {
			success: false;
			error: string;
	  };

function getChannelBumperStorageKey(
	channel: Awaited<ReturnType<typeof contentChannelRepository.findById>>,
	position: ContentChannelBumperPosition,
): string | null {
	if (!channel) {
		return null;
	}

	if (position === "intro") {
		return channel.introStorageKey;
	}
	if (position === "outro") {
		return channel.outroStorageKey;
	}
	if (position === "verticalIntro") {
		return channel.verticalIntroStorageKey;
	}
	return channel.verticalOutroStorageKey;
}

export async function updateContentChannelBumperAction(
	formData: FormData,
): Promise<UpdateContentChannelBumperActionResult> {
	try {
		await requireSession();
		const channelId = String(formData.get("channelId") ?? "");
		const positionResult = ContentChannelBumperPositionSchema.safeParse(
			String(formData.get("position") ?? ""),
		);
		const file = formData.get("file");

		if (!positionResult.success) {
			return { success: false, error: "Invalid bumper position" };
		}
		const position = positionResult.data;

		if (!(file instanceof File) || file.size <= 0) {
			return { success: false, error: "Choose a bumper video file" };
		}

		if (!file.type.startsWith("video/")) {
			return { success: false, error: "Bumper must be a video file" };
		}

		const channel = await contentChannelRepository.findById(channelId);
		if (!channel) {
			return { success: false, error: "Channel not found" };
		}

		const existingStorageKey = getChannelBumperStorageKey(channel, position);
		if (existingStorageKey) {
			await deleteStorageObject(existingStorageKey).catch((error: unknown) => {
				console.warn("Failed to delete previous channel bumper asset:", error);
			});
		}

		const storageKey = buildChannelBumperStorageKey(
			channel.id,
			position,
			file.name,
		);
		await uploadWebFileToStorage({
			key: storageKey,
			file,
			contentType: file.type || "video/mp4",
		});
		await assertStorageObjectExists(storageKey);

		const updatedChannel = await contentChannelRepository.updateBumper(
			UpdateContentChannelBumperSchema.parse({
				id: channel.id,
				position,
				storageKey,
				mimeType: file.type || "video/mp4",
			}),
		);

		return { success: true, data: updatedChannel };
	} catch (error) {
		console.error("Failed to update content channel bumper:", error);
		return {
			success: false,
			error:
				error instanceof Error
					? error.message
					: "Failed to update content channel bumper",
		};
	}
}

export async function deleteContentChannelBumperAction(input: {
	channelId: string;
	position: ContentChannelBumperPosition;
}): Promise<UpdateContentChannelBumperActionResult> {
	try {
		const position = ContentChannelBumperPositionSchema.parse(input.position);
		const channel = await contentChannelRepository.findById(input.channelId);
		if (!channel) {
			return { success: false, error: "Channel not found" };
		}

		const storageKey = getChannelBumperStorageKey(channel, position);
		if (storageKey) {
			await deleteStorageObject(storageKey).catch((error: unknown) => {
				console.warn("Failed to delete channel bumper asset:", error);
			});
		}

		const updatedChannel = await contentChannelRepository.updateBumper({
			id: channel.id,
			position,
			storageKey: null,
			mimeType: null,
		});

		return { success: true, data: updatedChannel };
	} catch (error) {
		console.error("Failed to delete content channel bumper:", error);
		return {
			success: false,
			error:
				error instanceof Error
					? error.message
					: "Failed to delete content channel bumper",
		};
	}
}
