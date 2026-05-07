import type {
	ContentJob,
	CreateContentJobInput,
} from "./content-job.valueobject";

export interface ContentJobRepositoryInterface {
	enqueue(input: CreateContentJobInput): Promise<ContentJob>;
	findById(id: string): Promise<ContentJob | null>;
	listRecent(limit?: number): Promise<ContentJob[]>;
	listByVideoId(videoId: string): Promise<ContentJob[]>;
	clearCompletedAndFailedByVideoId(videoId: string): Promise<number>;
	claimNextPending(runnerId: string): Promise<ContentJob | null>;
	requeueStaleRunningJobs(input: {
		staleBefore: Date;
		runnerId: string;
	}): Promise<number>;
	updateProgress(input: {
		id: string;
		progress: number;
		message?: string;
	}): Promise<ContentJob>;
	markCompleted(input: {
		id: string;
		result?: Record<string, unknown>;
	}): Promise<ContentJob>;
	markFailed(input: { id: string; error: string }): Promise<ContentJob>;
}
