import { describe, expect, it } from "vitest";
import {
	buildLibraryVideoSignature,
	buildYoutubeChapterText,
	filterLibraryVideos,
	filterTranscriptSegments,
	formatDuration,
	formatFileSize,
	getActiveVideoJobs,
	getClearableJobCount,
	getJobLabel,
	getJobMessage,
	getJobSubtitle,
	getStageClasses,
	getStageLabel,
	getStatusLabel,
	paginateLibraryVideos,
} from "~/modules/content-videos/application/content-clip-dashboard-view";
import {
	DashboardChapterMother,
	DashboardClipMother,
	DashboardVideoMother,
	TranscriptSegmentMother,
} from "../../../mothers/domain-mothers";

describe("content clip dashboard view helpers", () => {
	const translate = (
		key: string,
		values?: Record<string, string | number>,
	): string =>
		values ? `${key}:${Object.values(values).join(",")}` : `translated:${key}`;

	it("filters and paginates library videos", () => {
		const videos = [
			DashboardVideoMother.create({ id: "one", title: "Video one" }),
			DashboardVideoMother.create({ id: "two", title: "Launch notes" }),
		];

		expect(filterLibraryVideos(videos, "launch")).toHaveLength(1);
		expect(filterLibraryVideos(videos, "missing")).toHaveLength(0);
		expect(filterLibraryVideos(videos, "   ")).toEqual(videos);

		const page = paginateLibraryVideos(videos, 2, 1);
		expect(page.pageCount).toBe(2);
		expect(page.boundedPage).toBe(2);
		expect(page.videos[0]?.id).toBe("two");

		const outOfRangePage = paginateLibraryVideos(videos, 99, 10);
		expect(outOfRangePage.pageCount).toBe(1);
		expect(outOfRangePage.boundedPage).toBe(1);
		expect(outOfRangePage.videos).toHaveLength(2);
	});

	it("derives active and clearable jobs", () => {
		const activeJob = {
			id: "job-id",
			type: "transcribe-video",
			status: "running",
			progress: 50,
			payload: {},
			clipId: null,
			attempts: 1,
			message: null,
		} as const;
		const activeVideo = DashboardVideoMother.create({
			id: "one",
			activeJob,
		});

		expect(getActiveVideoJobs([activeVideo])).toEqual([
			{ video: activeVideo, job: activeJob },
		]);
		expect(
			getClearableJobCount([
				{ status: "completed" },
				{ status: "failed" },
				{ status: "running" },
			]),
		).toBe(2);
	});

	it("filters transcript and builds chapter copy text", () => {
		const segments = [
			TranscriptSegmentMother.create({ text: "Opening hook" }),
			TranscriptSegmentMother.create({ start: 2, end: 5, text: "Deep dive" }),
		];

		expect(filterTranscriptSegments(segments, "deep")).toEqual([segments[1]]);
		expect(filterTranscriptSegments(segments, "   ")).toEqual(segments);
		expect(
			buildYoutubeChapterText(
				[
					DashboardChapterMother.create({
						title: "Intro",
						startSeconds: 0,
					}),
				],
				(seconds) => `${seconds}:00`,
			),
		).toBe("0:00 Intro");
	});

	it("formats durations and file sizes", () => {
		expect(formatDuration(null, "Pending")).toBe("Pending");
		expect(formatDuration(65.9, "Pending")).toBe("1:05");
		expect(formatDuration(3661, "Pending")).toBe("1:01:01");
		expect(formatFileSize(2 * 1024 * 1024)).toBe("2.0 MB");
		expect(formatFileSize(3 * 1024 * 1024 * 1024)).toBe("3.00 GB");
	});

	it("maps stage, job, and status labels", () => {
		expect(getStageLabel("uploading", translate)).toBe(
			"translated:workspace.status.uploading",
		);
		expect(getStageLabel("ready", translate)).toBe(
			"translated:workspace.status.ready",
		);
		expect(getStageClasses("ready")).toContain("emerald");
		expect(getStageClasses("failed")).toContain("rose");
		expect(getStageClasses("queued")).toContain("amber");

		expect(
			getJobLabel({ type: "transcribe-video", payload: {} }, translate),
		).toBe("translated:workspace.jobType.transcribeVideo");
		expect(
			getJobLabel(
				{ type: "analyze-video", payload: { generateClips: false } },
				translate,
			),
		).toBe("translated:workspace.jobType.generateChapters");
		expect(
			getJobLabel(
				{ type: "analyze-video", payload: { generateChapters: false } },
				translate,
			),
		).toBe("translated:workspace.jobType.generateClips");
		expect(getJobLabel({ type: "analyze-video", payload: {} }, translate)).toBe(
			"translated:workspace.jobType.generateClipsAndChapters",
		);
		expect(getJobLabel({ type: "render-clip", payload: {} }, translate)).toBe(
			"translated:workspace.jobType.renderClip",
		);
		expect(
			getJobLabel({ type: "download-source", payload: {} }, translate),
		).toBe("translated:workspace.jobType.downloadSource");
		expect(getStatusLabel("completed", translate)).toBe(
			"translated:workspace.status.completed",
		);
		expect(getStatusLabel("custom", translate)).toBe("custom");
	});

	it("derives job subtitles and messages", () => {
		const clip = DashboardClipMother.create({
			id: "clip-id",
			title: "Matched clip",
		});

		expect(
			getJobSubtitle({ type: "render-clip", clipId: "clip-id", payload: {} }, [
				clip,
			]),
		).toBe("Matched clip");
		expect(
			getJobSubtitle({
				type: "render-clip",
				clipId: "missing",
				payload: { clipTitle: "Payload clip" },
			}),
		).toBe("Payload clip");
		expect(
			getJobSubtitle({ type: "analyze-video", clipId: null, payload: {} }),
		).toBeNull();

		expect(
			getJobMessage({ status: "pending", attempts: 0, result: {} }, translate),
		).toBe("translated:workspace.queue.waitingForWorker");
		expect(
			getJobMessage({ status: "running", attempts: 1, result: {} }, translate),
		).toBe("translated:workspace.queue.workerRunning");
		expect(
			getJobMessage(
				{
					status: "failed",
					attempts: 1,
					result: { message: "Worker failed" },
				},
				translate,
			),
		).toBe("Worker failed");
		expect(
			getJobMessage(
				{ status: "completed", attempts: 1, result: {} },
				translate,
			),
		).toBeNull();
	});

	it("builds a stable library video signature", () => {
		expect(
			buildLibraryVideoSignature([
				DashboardVideoMother.create({
					id: "video-a",
					title: "Video A",
					processingStage: "failed",
					latestError: "Failed",
					durationSeconds: null,
					sizeBytes: 2048,
					clipCount: 2,
					readyClipCount: 1,
					sourceType: "url",
				}),
			]),
		).toBe("video-a:Video A:failed:Failed::2048:2:1:url");
	});
});
