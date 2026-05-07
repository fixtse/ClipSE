import { describe, expect, it } from "vitest";
import {
	buildBumperStorageKey,
	buildSourceStorageKey,
	buildVideoTitle,
} from "~/modules/content-videos/domain/content-video.valueobject";

describe("content video helpers", () => {
	it("builds a title from the source filename when none is provided", () => {
		expect(buildVideoTitle("deep-dive_episode-01.mp4")).toBe(
			"deep-dive_episode-01",
		);
		expect(buildVideoTitle("webinar.mov", "  Final webinar title  ")).toBe(
			"Final webinar title",
		);
	});

	it("sanitizes storage keys for direct multipart uploads", () => {
		expect(
			buildSourceStorageKey("video-123", "My Final Cut! Episode 09.mov"),
		).toBe("videos/video-123/my-final-cut-episode-09.mov");
	});

	it("falls back to stable storage filenames when sanitized names are empty", () => {
		expect(buildVideoTitle(".mp4")).toBe("Untitled upload");
		expect(buildSourceStorageKey("video-123", "???")).toBe(
			"videos/video-123/source.mp4",
		);
		expect(buildBumperStorageKey("video-123", "intro", "???")).toBe(
			"videos/video-123/bumpers/intro-video.mp4",
		);
	});

	it("sanitizes intro and outro bumper storage keys", () => {
		expect(buildBumperStorageKey("video-123", "outro", "Final Outro.MOV")).toBe(
			"videos/video-123/bumpers/outro-final-outro.mov",
		);
	});
});
