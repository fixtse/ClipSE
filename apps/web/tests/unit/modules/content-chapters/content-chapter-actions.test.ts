import { describe, expect, it, vi } from "vitest";
import { listContentChapters } from "~/modules/content-chapters/application/list-content-chapters";
import { replaceContentVideoChapters } from "~/modules/content-chapters/application/replace-content-video-chapters";
import { DashboardChapterMother } from "../../../mothers/domain-mothers";
import { ClipSEChapterRepositoryMother } from "../../../mothers/repository-mothers";

describe("ClipSE chapter use cases", () => {
	it("lists chapters for a video", async () => {
		const chapters = [DashboardChapterMother.create()];
		const repository = ClipSEChapterRepositoryMother.create({
			listByVideoId: vi.fn(async () => chapters),
		});

		await expect(listContentChapters(repository, "video-1")).resolves.toEqual(
			chapters,
		);
		expect(repository.listByVideoId).toHaveBeenCalledWith("video-1");
	});

	it("replaces generated chapters for a video", async () => {
		const chapters = [DashboardChapterMother.create()];
		const generatedChapters = [
			{
				title: "Intro",
				startSeconds: 0,
				endSeconds: 20,
				summary: "Opening context",
				relatedClipIndexes: [0],
				confidence: 0.9,
			},
		];
		const repository = ClipSEChapterRepositoryMother.create({
			replaceForVideo: vi.fn(async () => chapters),
		});

		await expect(
			replaceContentVideoChapters(repository, "video-1", generatedChapters),
		).resolves.toEqual(chapters);
		expect(repository.replaceForVideo).toHaveBeenCalledWith(
			"video-1",
			generatedChapters,
		);
	});
});
