"use server";

import { clearFinishedContentJobs } from "~/modules/content-jobs/application/clear-finished-content-jobs";
import { contentJobRepository } from "~/modules/content-jobs/infrastructure/content-job.repository";
import { requireSession } from "~/server/auth";

type ClearFinishedContentJobsActionResult =
	| {
			success: true;
			data: Awaited<ReturnType<typeof clearFinishedContentJobs>>;
	  }
	| {
			success: false;
			error: string;
	  };

export async function clearFinishedContentJobsAction(input: {
	videoId: string;
}): Promise<ClearFinishedContentJobsActionResult> {
	try {
		await requireSession();
		const result = await clearFinishedContentJobs(contentJobRepository, input);

		return {
			success: true,
			data: result,
		};
	} catch (error) {
		console.error("Failed to clear finished content jobs:", error);
		return {
			success: false,
			error:
				error instanceof Error
					? error.message
					: "Failed to clear finished content jobs",
		};
	}
}
