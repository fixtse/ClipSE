import { describe, expect, it, vi } from "vitest";
import { deleteContentVideo } from "~/modules/content-videos/application/delete-content-video";
import {
	ClipSEMother,
	ClipSEVideoMother,
} from "../../../mothers/domain-mothers";
import {
	ClipSERepositoryMother,
	ClipSEVideoRepositoryMother,
} from "../../../mothers/repository-mothers";

const mocks = vi.hoisted(() => ({
	deleteCachedMediaFile: vi.fn(async () => undefined),
	deleteStorageObject: vi.fn(async () => undefined),
}));

vi.mock("~/server/lib/clipse-local-media", () => ({
	deleteCachedMediaFile: mocks.deleteCachedMediaFile,
}));

vi.mock("~/server/lib/clipse-storage", () => ({
	deleteStorageObject: mocks.deleteStorageObject,
}));

describe("deleteContentVideo", () => {
	it("returns zero deleted assets when the video is missing", async () => {
		const videoRepository = ClipSEVideoRepositoryMother.create({
			findById: vi.fn(async () => null),
		});
		const clipRepository = ClipSERepositoryMother.create();

		await expect(
			deleteContentVideo(videoRepository, clipRepository, {
				videoId: "11111111-1111-4111-8111-111111111111",
			}),
		).resolves.toEqual({
			id: "11111111-1111-4111-8111-111111111111",
			deletedAssetCount: 0,
		});
		expect(videoRepository.delete).not.toHaveBeenCalled();
	});

	it("deletes unique source and clip assets before deleting the video", async () => {
		const video = ClipSEVideoMother.create({
			storageKey: "videos/source.mp4",
		});
		const clip = ClipSEMother.create({
			outputStorageKey: "clips/rendered.mp4",
		});
		const duplicateClip = ClipSEMother.create({
			id: "33333333-3333-4333-8333-333333333334",
			outputStorageKey: "clips/rendered.mp4",
		});
		const videoRepository = ClipSEVideoRepositoryMother.create({
			findById: vi.fn(async () => video),
		});
		const clipRepository = ClipSERepositoryMother.create({
			listByVideoId: vi.fn(async () => [clip, duplicateClip]),
		});

		await expect(
			deleteContentVideo(videoRepository, clipRepository, {
				videoId: video.id,
			}),
		).resolves.toEqual({ id: video.id, deletedAssetCount: 2 });
		expect(mocks.deleteStorageObject).toHaveBeenCalledWith("videos/source.mp4");
		expect(mocks.deleteStorageObject).toHaveBeenCalledWith(
			"clips/rendered.mp4",
		);
		expect(mocks.deleteCachedMediaFile).toHaveBeenCalledWith(
			"videos/source.mp4",
		);
		expect(videoRepository.delete).toHaveBeenCalledWith(video.id);
	});

	it("continues deleting the database row when storage cleanup fails", async () => {
		const video = ClipSEVideoMother.create({
			storageKey: "videos/source.mp4",
		});
		mocks.deleteStorageObject.mockRejectedValueOnce(new Error("S3 down"));
		mocks.deleteCachedMediaFile.mockRejectedValueOnce(new Error("Cache down"));
		const consoleWarnSpy = vi
			.spyOn(console, "warn")
			.mockImplementation(() => {});
		const videoRepository = ClipSEVideoRepositoryMother.create({
			findById: vi.fn(async () => video),
		});

		await expect(
			deleteContentVideo(
				videoRepository,
				ClipSERepositoryMother.create({
					listByVideoId: vi.fn(async () => []),
				}),
				{ videoId: video.id },
			),
		).resolves.toEqual({ id: video.id, deletedAssetCount: 1 });
		expect(videoRepository.delete).toHaveBeenCalledWith(video.id);
		expect(consoleWarnSpy).toHaveBeenCalledWith(
			"Failed to delete storage object:",
			"videos/source.mp4",
			expect.any(Error),
		);
		expect(consoleWarnSpy).toHaveBeenCalledWith(
			"Failed to delete cached media file:",
			"videos/source.mp4",
			expect.any(Error),
		);
	});
});
