import type { ContentJobRepositoryInterface } from "../domain/content-job.repository.interface";

export async function clearFinishedContentJobs(
	jobRepository: ContentJobRepositoryInterface,
	input: {
		videoId: string;
	},
): Promise<{ clearedCount: number }> {
	const clearedCount = await jobRepository.clearCompletedAndFailedByVideoId(
		input.videoId,
	);

	return { clearedCount };
}
