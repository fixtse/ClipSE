import { describe, expect, it, vi } from "vitest";
import { deleteContentClip } from "~/modules/content-clips/application/delete-content-clip";
import { ContentClipMother } from "../../../mothers/domain-mothers";
import { ContentClipRepositoryMother } from "../../../mothers/repository-mothers";

describe("deleteContentClip", () => {
	it("returns the requested id when the clip is already gone", async () => {
		const clipRepository = ContentClipRepositoryMother.create({
			findById: vi.fn(async () => null),
		});

		await expect(
			deleteContentClip(clipRepository, {
				clipId: "33333333-3333-4333-8333-333333333333",
			}),
		).resolves.toEqual({ id: "33333333-3333-4333-8333-333333333333" });
		expect(clipRepository.delete).not.toHaveBeenCalled();
	});

	it("deletes non-running clips", async () => {
		const clip = ContentClipMother.create({ status: "ready" });
		const clipRepository = ContentClipRepositoryMother.create({
			findById: vi.fn(async () => clip),
		});

		await expect(
			deleteContentClip(clipRepository, { clipId: clip.id }),
		).resolves.toEqual({ id: clip.id });
		expect(clipRepository.delete).toHaveBeenCalledWith(clip.id);
	});

	it("rejects queued or rendering clips", async () => {
		const clipRepository = ContentClipRepositoryMother.create({
			findById: vi.fn(async () =>
				ContentClipMother.create({ status: "rendering" }),
			),
		});

		await expect(
			deleteContentClip(clipRepository, {
				clipId: "33333333-3333-4333-8333-333333333333",
			}),
		).rejects.toThrow("Queued or rendering clips cannot be deleted.");
		expect(clipRepository.delete).not.toHaveBeenCalled();
	});
});
