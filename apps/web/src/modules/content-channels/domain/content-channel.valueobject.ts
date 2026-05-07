import { z } from "zod";

export const ContentChannelSchema = z.object({
	id: z.string().uuid(),
	name: z.string().min(1).max(120),
	logoStorageKey: z.string().min(1).nullable(),
	logoMimeType: z.string().min(1).max(120).nullable(),
	introStorageKey: z.string().min(1).nullable(),
	introMimeType: z.string().min(1).max(120).nullable(),
	outroStorageKey: z.string().min(1).nullable(),
	outroMimeType: z.string().min(1).max(120).nullable(),
	createdAt: z.date(),
	updatedAt: z.date(),
});

export type ContentChannel = z.infer<typeof ContentChannelSchema>;

export const CreateContentChannelSchema = z.object({
	name: z.string().trim().min(1).max(120),
	logoStorageKey: z.string().min(1).nullable().optional(),
	logoMimeType: z.string().min(1).max(120).nullable().optional(),
});

export type CreateContentChannelInput = z.infer<
	typeof CreateContentChannelSchema
>;

export const UpdateContentChannelBumperSchema = z.object({
	id: z.string().uuid(),
	position: z.enum(["intro", "outro"]),
	storageKey: z.string().min(1).nullable(),
	mimeType: z.string().min(1).max(120).nullable(),
});

export type UpdateContentChannelBumperInput = z.infer<
	typeof UpdateContentChannelBumperSchema
>;

function sanitizeAssetName(filename: string): string {
	return filename
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
}

export function buildChannelBumperStorageKey(
	channelId: string,
	position: "intro" | "outro",
	filename: string,
): string {
	return `channels/${channelId}/bumpers/${position}-${sanitizeAssetName(filename) || "video.mp4"}`;
}

export function buildChannelLogoStorageKey(
	channelId: string,
	filename: string,
): string {
	return `channels/${channelId}/logo-${sanitizeAssetName(filename) || "logo.png"}`;
}
