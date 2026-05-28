import { describe, expect, it, vi } from "vitest";
import { clearFinishedContentJobs } from "~/modules/content-jobs/application/clear-finished-content-jobs";
import { ClipSEJobRepositoryMother } from "../../../mothers/repository-mothers";

describe("clearFinishedContentJobs", () => {
	it("returns the number of cleared completed and failed jobs", async () => {
		const jobRepository = ClipSEJobRepositoryMother.create({
			clearCompletedAndFailedByVideoId: vi.fn(async () => 3),
		});

		await expect(
			clearFinishedContentJobs(jobRepository, {
				videoId: "11111111-1111-4111-8111-111111111111",
			}),
		).resolves.toEqual({ clearedCount: 3 });
		expect(jobRepository.clearCompletedAndFailedByVideoId).toHaveBeenCalledWith(
			"11111111-1111-4111-8111-111111111111",
		);
	});
});
