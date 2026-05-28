import { describe, expect, it, vi } from "vitest";
import { createContentChannel } from "~/modules/content-channels/application/create-content-channel";
import { ClipSEChannelRepositoryMother } from "../../../mothers/repository-mothers";

describe("createContentChannel", () => {
	it("validates and delegates channel creation", async () => {
		const channelRepository = ClipSEChannelRepositoryMother.create({
			create: vi.fn(async (input) => ({
				id: "22222222-2222-4222-8222-222222222222",
				name: input.name,
				logoStorageKey: input.logoStorageKey ?? null,
				logoMimeType: input.logoMimeType ?? null,
				introStorageKey: null,
				introMimeType: null,
				outroStorageKey: null,
				outroMimeType: null,
				verticalIntroStorageKey: null,
				verticalIntroMimeType: null,
				verticalOutroStorageKey: null,
				verticalOutroMimeType: null,
				createdAt: new Date(0),
				updatedAt: new Date(0),
			})),
		});

		await expect(
			createContentChannel(channelRepository, {
				name: "  Launch channel  ",
				logoStorageKey: "channels/logo.png",
				logoMimeType: "image/png",
			}),
		).resolves.toMatchObject({
			name: "Launch channel",
			logoStorageKey: "channels/logo.png",
		});
		expect(channelRepository.create).toHaveBeenCalledWith({
			name: "Launch channel",
			logoStorageKey: "channels/logo.png",
			logoMimeType: "image/png",
		});
	});
});
