import { describe, expect, it } from "vitest";
import { parseFfmpegProgressSeconds } from "~/server/lib/contentclip-media";

describe("contentclip media progress", () => {
	it("parses ffmpeg progress timestamps", () => {
		expect(parseFfmpegProgressSeconds("out_time=00:01:02.500000")).toBe(62.5);
		expect(parseFfmpegProgressSeconds("out_time_us=2500000")).toBe(2.5);
		expect(parseFfmpegProgressSeconds("out_time_ms=1750000")).toBe(1.75);
	});

	it("ignores unrelated ffmpeg progress lines", () => {
		expect(parseFfmpegProgressSeconds("progress=continue")).toBeNull();
		expect(parseFfmpegProgressSeconds("frame=42")).toBeNull();
	});
});
