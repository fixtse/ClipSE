import { describe, expect, it } from "vitest";
import {
	ContentChapterSchema,
	GeneratedChapterSchema,
} from "~/modules/content-chapters/domain/content-chapter.valueobject";
import { DashboardChapterMother } from "../../../mothers/domain-mothers";

describe("content chapter schemas", () => {
	it("parses stored chapters and applies generated chapter defaults", () => {
		expect(
			ContentChapterSchema.parse(DashboardChapterMother.create()).title,
		).toBe("Intro");
		expect(
			GeneratedChapterSchema.parse({
				title: "Chapter",
				startSeconds: 0,
				endSeconds: 30,
			}),
		).toEqual({
			title: "Chapter",
			startSeconds: 0,
			endSeconds: 30,
			summary: "",
			relatedClipIndexes: [],
			confidence: 0.7,
		});
	});
});
