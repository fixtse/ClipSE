import { describe, expect, it } from "vitest";
import {
	buildAssSubtitleFile,
	buildRenderSubtitleCues,
} from "~/server/lib/contentclip-subtitles";

describe("contentclip subtitles", () => {
	it("clips transcription segments and splits long text into short cues", () => {
		const cues = buildRenderSubtitleCues({
			clipStartSeconds: 10,
			clipEndSeconds: 16,
			segments: [
				{
					start: 9,
					end: 15,
					text: "This is a very useful clip moment",
				},
			],
		});

		expect(cues).toMatchObject([
			{ startSeconds: 0, endSeconds: 2.5, text: "This is a very" },
			{ startSeconds: 2.5, endSeconds: 5, text: "useful clip moment" },
		]);
		expect(cues[0]?.words.map((word) => word.text)).toEqual([
			"This",
			"is",
			"a",
			"very",
		]);
	});

	it("escapes ASS syntax in generated subtitle files", () => {
		const ass = buildAssSubtitleFile([
			{
				startSeconds: 0,
				endSeconds: 1.2,
				text: "Use {braces} and \\ slash",
				words: [],
			},
		]);

		expect(ass).toContain("PlayResX: 1080");
		expect(ass).toContain("0:00:00.00,0:00:01.19");
		expect(ass).toContain("Use \\{braces\\} and \\\\ slash");
	});
});
