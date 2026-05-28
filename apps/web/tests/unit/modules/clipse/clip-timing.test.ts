import { describe, expect, it } from "vitest";
import {
	formatTimecode,
	parseTimecode,
	roundToFrame,
} from "~/modules/content-clips/application/clip-timing";

describe("clip timing helpers", () => {
	it("formats seconds as timecodes", () => {
		expect(formatTimecode(0)).toBe("0:00");
		expect(formatTimecode(65.9)).toBe("1:05");
		expect(formatTimecode(3661)).toBe("1:01:01");
	});

	it("parses timecode strings", () => {
		expect(parseTimecode("90")).toBe(90);
		expect(parseTimecode("1:30")).toBe(90);
		expect(parseTimecode("1:02:03")).toBe(3723);
		expect(parseTimecode("")).toBeNull();
		expect(parseTimecode("-1")).toBeNull();
		expect(parseTimecode("1:two")).toBeNull();
	});

	it("rounds to frame boundaries when a frame rate is available", () => {
		expect(roundToFrame(1.016, 30)).toBe(1);
		expect(roundToFrame(1.02, 30)).toBe(1.033);
		expect(roundToFrame(1.23456, null)).toBe(1.235);
	});
});
