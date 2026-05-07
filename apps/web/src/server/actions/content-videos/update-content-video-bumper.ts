"use server";

import {
	buildBumperStorageKey,
	UpdateContentVideoBumperSchema,
} from "~/modules/content-videos/domain/content-video.valueobject";
import { contentVideoRepository } from "~/modules/content-videos/infrastructure/content-video.repository";
import { requireSession } from "~/server/auth";
import {
	deleteStorageObject,
	uploadWebFileToStorage,
} from "~/server/lib/contentclip-storage";

type UpdateContentVideoBumperActionResult =
	| {
			success: true;
			data: Awaited<ReturnType<typeof contentVideoRepository.updateBumper>>;
	  }
	| {
			success: false;
			error: string;
	  };

export async function updateContentVideoBumperAction(
	formData: FormData,
): Promise<UpdateContentVideoBumperActionResult> {
	try {
		await requireSession();
		const videoId = String(formData.get("videoId") ?? "");
		const position = String(formData.get("position") ?? "");
		const file = formData.get("file");

		if (position !== "intro" && position !== "outro") {
			return { success: false, error: "Invalid bumper position" };
		}

		if (!(file instanceof File) || file.size <= 0) {
			return { success: false, error: "Choose a bumper video file" };
		}

		if (!file.type.startsWith("video/")) {
			return { success: false, error: "Bumper must be a video file" };
		}

		const video = await contentVideoRepository.findById(videoId);
		if (!video) {
			return { success: false, error: "Source video not found" };
		}

		const existingStorageKey =
			position === "intro" ? video.introStorageKey : video.outroStorageKey;
		if (existingStorageKey) {
			await deleteStorageObject(existingStorageKey).catch((error: unknown) => {
				console.warn("Failed to delete previous bumper asset:", error);
			});
		}

		const storageKey = buildBumperStorageKey(video.id, position, file.name);
		await uploadWebFileToStorage({
			key: storageKey,
			file,
			contentType: file.type || "video/mp4",
		});

		const validatedInput = UpdateContentVideoBumperSchema.parse({
			id: video.id,
			position,
			storageKey,
			mimeType: file.type || "video/mp4",
		});

		const updatedVideo =
			await contentVideoRepository.updateBumper(validatedInput);

		return {
			success: true,
			data: updatedVideo,
		};
	} catch (error) {
		console.error("Failed to update content video bumper:", error);
		return {
			success: false,
			error:
				error instanceof Error
					? error.message
					: "Failed to update content video bumper",
		};
	}
}

export async function deleteContentVideoBumperAction(input: {
	videoId: string;
	position: "intro" | "outro";
}): Promise<UpdateContentVideoBumperActionResult> {
	try {
		const video = await contentVideoRepository.findById(input.videoId);
		if (!video) {
			return { success: false, error: "Source video not found" };
		}

		const storageKey =
			input.position === "intro"
				? video.introStorageKey
				: video.outroStorageKey;
		if (storageKey) {
			await deleteStorageObject(storageKey).catch((error: unknown) => {
				console.warn("Failed to delete bumper asset:", error);
			});
		}

		const updatedVideo = await contentVideoRepository.updateBumper({
			id: video.id,
			position: input.position,
			storageKey: null,
			mimeType: null,
		});

		return {
			success: true,
			data: updatedVideo,
		};
	} catch (error) {
		console.error("Failed to delete content video bumper:", error);
		return {
			success: false,
			error:
				error instanceof Error
					? error.message
					: "Failed to delete content video bumper",
		};
	}
}
