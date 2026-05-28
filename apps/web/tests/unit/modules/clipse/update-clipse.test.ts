import { describe, expect, it, vi } from "vitest";
import { updateClipSE } from "~/modules/content-clips/application/update-content-clip";
import { ClipSEMother } from "../../../mothers/domain-mothers";
import { ClipSERepositoryMother } from "../../../mothers/repository-mothers";

describe("updateClipSE", () => {
	it("updates a clip with merged timing from the current clip", async () => {
		const currentClip = ClipSEMother.create({
			id: "33333333-3333-4333-8333-333333333333",
			startSeconds: 10,
			endSeconds: 30,
		});
		const updatedClip = ClipSEMother.create({
			...currentClip,
			title: "Updated title",
			endSeconds: 40,
		});
		const clipRepository = ClipSERepositoryMother.create({
			findById: vi.fn(async () => currentClip),
			update: vi.fn(async () => updatedClip),
		});

		await expect(
			updateClipSE(clipRepository, {
				id: currentClip.id,
				title: "Updated title",
				endSeconds: 40,
			}),
		).resolves.toEqual(updatedClip);
		expect(clipRepository.update).toHaveBeenCalledWith({
			id: currentClip.id,
			title: "Updated title",
			startSeconds: 10,
			endSeconds: 40,
		});
	});

	it("rejects when the clip is missing", async () => {
		const clipRepository = ClipSERepositoryMother.create({
			findById: vi.fn(async () => null),
		});

		await expect(
			updateClipSE(clipRepository, {
				id: "33333333-3333-4333-8333-333333333333",
				title: "Updated title",
			}),
		).rejects.toThrow("Clip not found");
		expect(clipRepository.update).not.toHaveBeenCalled();
	});

	it("rejects invalid merged timing", async () => {
		const currentClip = ClipSEMother.create({
			startSeconds: 10,
			endSeconds: 30,
		});
		const clipRepository = ClipSERepositoryMother.create({
			findById: vi.fn(async () => currentClip),
		});

		await expect(
			updateClipSE(clipRepository, {
				id: currentClip.id,
				startSeconds: 30,
			}),
		).rejects.toThrow("Clip end time must be greater than the start time");
		expect(clipRepository.update).not.toHaveBeenCalled();
	});

	it("rejects invalid update shape before repository access", async () => {
		const clipRepository = ClipSERepositoryMother.create();

		await expect(
			updateClipSE(clipRepository, {
				id: "invalid-id",
				title: "Updated title",
			}),
		).rejects.toThrow();
		expect(clipRepository.findById).not.toHaveBeenCalled();
		expect(clipRepository.update).not.toHaveBeenCalled();
	});
});
