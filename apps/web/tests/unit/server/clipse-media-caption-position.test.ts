import { describe, expect, it } from "vitest";
import { getVerticalCaptionYRatio } from "~/server/lib/clipse-media";

describe("clipse media caption position", () => {
	it("centers subtitles for stacked 2-in-1 vertical clips", () => {
		expect(getVerticalCaptionYRatio({ hasStackedLayout: true })).toBe(0.5);
	});

	it("keeps regular vertical clip subtitles below center", () => {
		expect(getVerticalCaptionYRatio({ hasStackedLayout: false })).toBe(0.73);
	});
});
