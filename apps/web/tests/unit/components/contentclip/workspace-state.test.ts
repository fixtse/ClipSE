import { describe, expect, it, vi } from "vitest";
import {
	buildWorkspaceBrowserUrl,
	getBrowserWorkspaceStorage,
	getClipListTabFromBrowserUrl,
	getDashboardSelectedVideoId,
	getDashboardVideos,
	getInitialClipListTab,
	getInitialSelectedChannelId,
	getInitialSelectedClipId,
	getInitialSelectedVideoId,
	getInitialWorkspaceTab,
	getManualClipTiming,
	getSelectedClipIdFromBrowserUrl,
	getSelectedVideoFromDashboard,
	getWorkspaceTabFromBrowserUrl,
	getYoutubeChapterText,
	shouldShowFloatingJobButton,
} from "~/components/contentclip/workspace-state";
import { SELECTED_CHANNEL_STORAGE_KEY } from "~/modules/content-videos/application/content-clip-dashboard-view";
import {
	DashboardChapterMother,
	DashboardVideoMother,
} from "../../../mothers/domain-mothers";

describe("workspace state helpers", () => {
	it("reads browser storage when a window is available", () => {
		vi.stubGlobal("window", {
			location: {
				href: "https://contentclip.test/en?tab=intake",
			},
			localStorage: {
				getItem: vi.fn((key: string) =>
					key === SELECTED_CHANNEL_STORAGE_KEY ? "channel-1" : null,
				),
			},
		});

		expect(getBrowserWorkspaceStorage()).toEqual({
			locationHref: "https://contentclip.test/en?tab=intake",
			selectedChannelId: "channel-1",
		});
	});

	it("reads initial tab, video, and channel values from browser storage", () => {
		const storage = {
			locationHref:
				"https://contentclip.test/en?tab=bumpers&videoId=video-1&clipTab=short&clipId=clip-1",
			selectedChannelId: "channel-1",
		};

		expect(getInitialWorkspaceTab(storage)).toBe("bumpers");
		expect(getInitialClipListTab(storage)).toBe("short");
		expect(
			getInitialSelectedVideoId({
				requestedVideoId: null,
				storage,
			}),
		).toBe("video-1");
		expect(getInitialSelectedClipId(storage)).toBe("clip-1");
		expect(getInitialSelectedChannelId(storage)).toBe("channel-1");
	});

	it("falls back to media defaults and prefers requested video ids", () => {
		expect(getInitialWorkspaceTab(null)).toBe("media");
		expect(getInitialClipListTab(null)).toBe("standard");
		expect(getInitialSelectedClipId(null)).toBeNull();
		expect(getInitialSelectedChannelId(null)).toBeNull();
		expect(
			getInitialSelectedVideoId({
				requestedVideoId: "requested-video",
				storage: {
					locationHref:
						"https://contentclip.test/en?tab=unknown&videoId=url-video",
					selectedChannelId: null,
				},
			}),
		).toBe("requested-video");
		expect(
			getWorkspaceTabFromBrowserUrl("https://contentclip.test/en?tab=unknown"),
		).toBe("media");
		expect(
			getWorkspaceTabFromBrowserUrl("https://contentclip.test/en?tab=intake"),
		).toBe("intake");
		expect(
			getClipListTabFromBrowserUrl(
				"https://contentclip.test/en?clipTab=unknown",
			),
		).toBe("standard");
		expect(
			getClipListTabFromBrowserUrl("https://contentclip.test/en?clipTab=short"),
		).toBe("short");
		expect(
			getSelectedClipIdFromBrowserUrl(
				"https://contentclip.test/en?clipId=clip-2",
			),
		).toBe("clip-2");
	});

	it("keeps dashboard video selection scoped to the selected channel", () => {
		expect(
			getDashboardSelectedVideoId({
				selectedVideoId: null,
				selectedChannelId: "channel-1",
				selectedVideoChannelId: "channel-1",
			}),
		).toBeUndefined();
		expect(
			getDashboardSelectedVideoId({
				selectedVideoId: "video-1",
				selectedChannelId: "channel-1",
				selectedVideoChannelId: "channel-1",
			}),
		).toBe("video-1");
		expect(
			getDashboardSelectedVideoId({
				selectedVideoId: "video-1",
				selectedChannelId: "channel-2",
				selectedVideoChannelId: "channel-1",
			}),
		).toBeUndefined();
	});

	it("filters dashboard data when the selected channel no longer matches", () => {
		const selectedVideo = {
			chapters: [],
			clips: [],
			shorts: [],
			introUrl: null,
			jobs: [],
			outroUrl: null,
			sourceUrl: null,
			transcription: null,
			video: DashboardVideoMother.create(),
		};
		const videos = [DashboardVideoMother.create()];

		expect(
			getSelectedVideoFromDashboard({
				dataMatchesSelectedChannel: true,
				selectedVideo,
			}),
		).toBe(selectedVideo);
		expect(
			getSelectedVideoFromDashboard({
				dataMatchesSelectedChannel: false,
				selectedVideo,
			}),
		).toBeNull();
		expect(
			getDashboardVideos({
				dataMatchesSelectedChannel: true,
				videos,
			}),
		).toEqual(videos);
		expect(
			getDashboardVideos({
				dataMatchesSelectedChannel: false,
				videos,
			}),
		).toEqual([]);
		expect(
			getDashboardVideos({
				dataMatchesSelectedChannel: true,
				videos: null,
			}),
		).toEqual([]);
	});

	it("serializes selected workspace state back into the browser URL", () => {
		expect(
			buildWorkspaceBrowserUrl({
				locationHref:
					"https://contentclip.test/en?tab=intake&videoId=old&clipTab=short&clipId=old-clip&other=1",
				selectedVideoId: "video-2",
				workspaceTab: "media",
				clipListTab: "standard",
				selectedClipId: null,
			}),
		).toBe("https://contentclip.test/en?videoId=video-2&other=1");

		expect(
			buildWorkspaceBrowserUrl({
				locationHref: "https://contentclip.test/en?videoId=old",
				selectedVideoId: null,
				workspaceTab: "intake",
				clipListTab: "short",
				selectedClipId: "clip-1",
			}),
		).toBe(
			"https://contentclip.test/en?tab=intake&clipTab=short&clipId=clip-1",
		);
	});

	it("shows the floating job button for relevant active work", () => {
		expect(
			shouldShowFloatingJobButton({
				workspaceTab: "media",
				selectedVideoJobs: [{} as never],
				activeVideoJobCount: 0,
			}),
		).toBe(true);
		expect(
			shouldShowFloatingJobButton({
				workspaceTab: "media",
				selectedVideoJobs: [],
				activeVideoJobCount: 1,
			}),
		).toBe(true);
		expect(
			shouldShowFloatingJobButton({
				workspaceTab: "intake",
				selectedVideoJobs: [{} as never],
				activeVideoJobCount: 0,
			}),
		).toBe(false);
		expect(
			shouldShowFloatingJobButton({
				workspaceTab: "bumpers",
				selectedVideoJobs: [],
				activeVideoJobCount: 1,
			}),
		).toBe(true);
	});

	it("calculates bounded manual clip timing on frame boundaries", () => {
		expect(
			getManualClipTiming({
				currentTime: 118,
				durationSeconds: 120,
				frameRate: 30,
			}),
		).toEqual({ startSeconds: 115, endSeconds: 120 });

		expect(
			getManualClipTiming({
				currentTime: -10,
				durationSeconds: null,
				frameRate: null,
			}),
		).toEqual({ startSeconds: 0, endSeconds: 60 });
	});

	it("builds copyable chapter text only when a selected video exists", () => {
		expect(getYoutubeChapterText(null)).toBe("");
		expect(
			getYoutubeChapterText({
				chapters: [
					DashboardChapterMother.create({
						startSeconds: 65,
						title: "Second chapter",
					}),
				],
				clips: [],
				shorts: [],
				introUrl: null,
				jobs: [],
				outroUrl: null,
				sourceUrl: null,
				transcription: null,
				video: DashboardVideoMother.create(),
			}),
		).toContain("1:05 Second chapter");
	});
});
