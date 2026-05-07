import { describe, expect, it, vi } from "vitest";
import { updateContentClip } from "~/modules/content-clips/application/update-content-clip";
import { ContentClipMother } from "../../../mothers/domain-mothers";
import { ContentClipRepositoryMother } from "../../../mothers/repository-mothers";

describe("updateContentClip", () => {
	it("updates a clip with merged timing from the current clip", async () => {
		const currentClip = ContentClipMother.create({
			id: "33333333-3333-4333-8333-333333333333",
			startSeconds: 10,
			endSeconds: 30,
		});
		const updatedClip = ContentClipMother.create({
			...currentClip,
			title: "Updated title",
			endSeconds: 40,
		});
		const clipRepository = ContentClipRepositoryMother.create({
			findById: vi.fn(async () => currentClip),
			update: vi.fn(async () => updatedClip),
		});

		await expect(
			updateContentClip(clipRepository, {
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
		const clipRepository = ContentClipRepositoryMother.create({
			findById: vi.fn(async () => null),
		});

		await expect(
			updateContentClip(clipRepository, {
				id: "33333333-3333-4333-8333-333333333333",
				title: "Updated title",
			}),
		).rejects.toThrow("Clip not found");
		expect(clipRepository.update).not.toHaveBeenCalled();
	});

	it("rejects invalid merged timing", async () => {
		const currentClip = ContentClipMother.create({
			startSeconds: 10,
			endSeconds: 30,
		});
		const clipRepository = ContentClipRepositoryMother.create({
			findById: vi.fn(async () => currentClip),
		});

		await expect(
			updateContentClip(clipRepository, {
				id: currentClip.id,
				startSeconds: 30,
			}),
		).rejects.toThrow("Clip end time must be greater than the start time");
		expect(clipRepository.update).not.toHaveBeenCalled();
	});

	it("rejects invalid update shape before repository access", async () => {
		const clipRepository = ContentClipRepositoryMother.create();

		await expect(
			updateContentClip(clipRepository, {
				id: "invalid-id",
				title: "Updated title",
			}),
		).rejects.toThrow();
		expect(clipRepository.findById).not.toHaveBeenCalled();
		expect(clipRepository.update).not.toHaveBeenCalled();
	});
});
