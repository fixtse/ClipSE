import { describe, expect, it } from "vitest";
import {
	buildChannelBumperStorageKey,
	buildChannelLogoStorageKey,
} from "~/modules/content-channels/domain/content-channel.valueobject";

describe("content channel helpers", () => {
	it("sanitizes channel asset storage keys", () => {
		expect(
			buildChannelLogoStorageKey("channel-123", "Primary Logo FINAL.png"),
		).toBe("channels/channel-123/logo-primary-logo-final.png");
		expect(
			buildChannelBumperStorageKey("channel-123", "intro", "Intro Clip.MOV"),
		).toBe("channels/channel-123/bumpers/intro-intro-clip.mov");
	});

	it("uses stable fallback filenames when sanitized asset names are empty", () => {
		expect(buildChannelLogoStorageKey("channel-123", "???")).toBe(
			"channels/channel-123/logo-logo.png",
		);
		expect(buildChannelBumperStorageKey("channel-123", "outro", "???")).toBe(
			"channels/channel-123/bumpers/outro-video.mp4",
		);
	});
});
