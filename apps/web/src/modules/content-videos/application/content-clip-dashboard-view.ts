import type {
	ContentClipDashboard,
	ContentClipDashboardSelectedVideo,
	ContentClipDashboardVideo,
} from "./get-content-clip-dashboard";

export const LIBRARY_VIDEOS_PER_PAGE = 5;
export const SELECTED_CHANNEL_STORAGE_KEY = "contentclip:selectedChannelId";

export type TranslateFn = (
	key: string,
	values?: Record<string, string | number>,
) => string;

export type DashboardJob = ContentClipDashboard["jobs"][number];
export type SelectedVideoJob =
	ContentClipDashboardSelectedVideo["jobs"][number];
export type ClipItem = ContentClipDashboardSelectedVideo["clips"][number];
export type TranscriptSegment = NonNullable<
	ContentClipDashboardSelectedVideo["transcription"]
>["segments"][number];

export function formatDuration(
	seconds: number | null | undefined,
	pendingLabel: string,
): string {
	if (seconds == null) {
		return pendingLabel;
	}

	const totalSeconds = Math.floor(seconds);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const remainder = totalSeconds % 60;

	if (hours > 0) {
		return `${hours}:${minutes.toString().padStart(2, "0")}:${remainder.toString().padStart(2, "0")}`;
	}

	return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

export function formatFileSize(bytes: number): string {
	if (bytes >= 1024 * 1024 * 1024) {
		return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
	}

	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatJobTimestamp(value: Date): string {
	const date = new Date(value);

	try {
		return new Intl.DateTimeFormat(undefined, {
			day: "2-digit",
			month: "2-digit",
			year: "numeric",
			hour: "numeric",
			minute: "2-digit",
			hour12: true,
		}).format(date);
	} catch {
		const day = date.getDate().toString().padStart(2, "0");
		const month = (date.getMonth() + 1).toString().padStart(2, "0");
		const year = date.getFullYear();
		const hours = date.getHours();
		const twelveHour = hours % 12 || 12;
		const minutes = date.getMinutes().toString().padStart(2, "0");
		const meridiem = hours >= 12 ? "PM" : "AM";

		return `${day}-${month}-${year} ${twelveHour}:${minutes} ${meridiem}`;
	}
}

export function getStageLabel(
	stage: ContentClipDashboardVideo["processingStage"],
	translate: TranslateFn,
): string {
	switch (stage) {
		case "uploading":
			return translate("workspace.status.uploading");
		case "queued":
			return translate("workspace.status.queued");
		case "transcribing":
			return translate("workspace.status.transcribing");
		case "analyzing":
			return translate("workspace.status.analyzing");
		case "ready":
			return translate("workspace.status.ready");
		case "failed":
			return translate("workspace.status.failed");
		default:
			return stage;
	}
}

export function getStageClasses(
	stage: ContentClipDashboardVideo["processingStage"],
): string {
	switch (stage) {
		case "ready":
			return "border-emerald-400/25 bg-emerald-400/10 text-emerald-100";
		case "failed":
			return "border-rose-400/25 bg-rose-400/10 text-rose-100";
		default:
			return "border-amber-300/20 bg-amber-300/10 text-amber-50";
	}
}

export function getJobLabel(
	job: Pick<DashboardJob, "type" | "payload">,
	translate: TranslateFn,
): string {
	switch (job.type) {
		case "transcribe-video":
			return translate("workspace.jobType.transcribeVideo");
		case "analyze-video":
			if (job.payload.generateClips === false) {
				return translate("workspace.jobType.generateChapters");
			}
			if (job.payload.generateChapters === false) {
				return translate("workspace.jobType.generateClips");
			}
			return translate("workspace.jobType.generateClipsAndChapters");
		case "render-clip":
			return translate("workspace.jobType.renderClip");
		case "download-source":
			return translate("workspace.jobType.downloadSource");
		default:
			return job.type;
	}
}

export function getJobSubtitle(
	job: Pick<DashboardJob, "type" | "payload" | "clipId">,
	clips: ClipItem[] = [],
): string | null {
	if (job.type !== "render-clip") {
		return null;
	}

	return (
		clips.find((clip) => clip.id === job.clipId)?.title ??
		(typeof job.payload.clipTitle === "string" ? job.payload.clipTitle : null)
	);
}

export function getJobMessage(
	job: Pick<DashboardJob, "status" | "attempts" | "result">,
	translate: TranslateFn,
): string | null {
	if (typeof job.result.message === "string") {
		return job.result.message;
	}

	if (job.status === "pending" && job.attempts === 0) {
		return translate("workspace.queue.waitingForWorker");
	}

	if (job.status === "running" && job.attempts > 0) {
		return translate("workspace.queue.workerRunning");
	}

	return null;
}

export function getStatusLabel(status: string, translate: TranslateFn): string {
	switch (status) {
		case "suggested":
			return translate("workspace.status.suggested");
		case "queued":
			return translate("workspace.status.queued");
		case "rendering":
			return translate("workspace.status.rendering");
		case "ready":
			return translate("workspace.status.ready");
		case "failed":
			return translate("workspace.status.failed");
		case "pending":
			return translate("workspace.status.pending");
		case "running":
			return translate("workspace.status.running");
		case "completed":
			return translate("workspace.status.completed");
		default:
			return status;
	}
}

export function getClearableJobCount(
	jobs: Array<Pick<SelectedVideoJob, "status">>,
): number {
	return jobs.filter(
		(job) => job.status === "completed" || job.status === "failed",
	).length;
}

export function getActiveVideoJobs(videos: ContentClipDashboardVideo[]): Array<{
	video: ContentClipDashboardVideo;
	job: NonNullable<ContentClipDashboardVideo["activeJob"]>;
}> {
	return videos.flatMap((video) =>
		video.activeJob
			? [
					{
						video,
						job: video.activeJob,
					},
				]
			: [],
	);
}

export function filterLibraryVideos(
	videos: ContentClipDashboardVideo[],
	search: string,
): ContentClipDashboardVideo[] {
	const normalizedSearch = search.trim().toLowerCase();
	if (!normalizedSearch) {
		return videos;
	}

	return videos.filter((video) =>
		[
			video.title,
			video.originalFilename,
			video.sourceUrl ?? "",
			video.processingStage,
		]
			.join(" ")
			.toLowerCase()
			.includes(normalizedSearch),
	);
}

export function paginateLibraryVideos(
	videos: ContentClipDashboardVideo[],
	page: number,
	perPage = LIBRARY_VIDEOS_PER_PAGE,
): {
	pageCount: number;
	boundedPage: number;
	videos: ContentClipDashboardVideo[];
} {
	const pageCount = Math.max(1, Math.ceil(videos.length / perPage));
	const boundedPage = Math.min(Math.max(1, page), pageCount);

	return {
		pageCount,
		boundedPage,
		videos: videos.slice((boundedPage - 1) * perPage, boundedPage * perPage),
	};
}

export function filterTranscriptSegments(
	segments: TranscriptSegment[],
	search: string,
): TranscriptSegment[] {
	const normalizedSearch = search.trim().toLowerCase();
	if (!normalizedSearch) {
		return segments;
	}

	return segments.filter((segment) =>
		segment.text.toLowerCase().includes(normalizedSearch),
	);
}

export function buildYoutubeChapterText(
	chapters: ContentClipDashboardSelectedVideo["chapters"],
	formatTime: (seconds: number) => string,
): string {
	return chapters
		.map((chapter) => `${formatTime(chapter.startSeconds)} ${chapter.title}`)
		.join("\n");
}

export function buildLibraryVideoSignature(
	videos: ContentClipDashboardVideo[],
): string {
	return videos
		.map((video) =>
			[
				video.id,
				video.title,
				video.processingStage,
				video.latestError ?? "",
				video.durationSeconds ?? "",
				video.sizeBytes,
				video.clipCount,
				video.readyClipCount,
				video.sourceType,
			].join(":"),
		)
		.join("|");
}
