import { describe, expect, it } from "vitest";
import {
	buildAssSubtitleFile,
	buildRenderSubtitleCues,
} from "~/server/lib/clipse-subtitles";

describe("clipse subtitles", () => {
	it("clips transcription segments and splits long text into one- or two-word cues", () => {
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
			{ startSeconds: 0, endSeconds: 1.25, text: "This is" },
			{ startSeconds: 1.25, endSeconds: 2.5, text: "a very" },
			{ startSeconds: 2.5, endSeconds: 3.75, text: "useful clip" },
			{ startSeconds: 3.75, endSeconds: 5, text: "moment" },
		]);
		expect(cues[0]?.words.map((word) => word.text)).toEqual(["This", "is"]);
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

	it("keeps fast Spanish two-word cues instead of dropping sentences", () => {
		const cues = buildRenderSubtitleCues({
			clipStartSeconds: 0,
			clipEndSeconds: 2,
			segments: [
				{
					start: 0,
					end: 2,
					text: "Entonces aquí tenemos una prueba rápida para verificar subtítulos",
				},
			],
		});

		expect(cues.map((cue) => cue.text)).toEqual([
			"Entonces aquí",
			"tenemos una",
			"prueba rápida",
			"para verificar",
			"subtítulos",
		]);
		expect(cues.every((cue) => cue.endSeconds > cue.startSeconds)).toBe(true);
	});

	it("uses Whisper word timestamps when available", () => {
		const cues = buildRenderSubtitleCues({
			clipStartSeconds: 10,
			clipEndSeconds: 15,
			segments: [
				{
					start: 10,
					end: 15,
					text: "This pause lands better",
					words: [
						{ start: 10.1, end: 10.35, text: "This" },
						{ start: 10.4, end: 10.7, text: "pause" },
						{ start: 12.2, end: 12.55, text: "lands" },
						{ start: 14.1, end: 14.45, text: "better" },
					],
				},
			],
		});

		expect(cues).toMatchObject([
			{
				startSeconds: 0.1,
				endSeconds: 0.7,
				text: "This pause",
				words: [
					{ startSeconds: 0.1, endSeconds: 0.35, text: "This" },
					{ startSeconds: 0.4, endSeconds: 0.7, text: "pause" },
				],
			},
			{
				startSeconds: 2.2,
				endSeconds: 4.45,
				text: "lands better",
				words: [
					{ startSeconds: 2.2, endSeconds: 2.55, text: "lands" },
					{ startSeconds: 4.1, endSeconds: 4.45, text: "better" },
				],
			},
		]);
	});
});
