import {
	formatTimecode,
	roundToFrame,
} from "~/modules/content-clips/application/clip-timing";
import {
	buildYoutubeChapterText,
	SELECTED_CHANNEL_STORAGE_KEY,
	type SelectedVideoJob,
} from "~/modules/content-videos/application/content-clip-dashboard-view";
import type {
	ContentClipDashboardSelectedVideo,
	ContentClipDashboardVideo,
} from "~/modules/content-videos/application/get-content-clip-dashboard";

export type WorkspaceTab = "media" | "intake" | "bumpers";

export interface BrowserWorkspaceStorage {
	readonly locationHref: string;
	readonly selectedChannelId: string | null;
}

export function isWorkspaceTab(value: string | null): value is WorkspaceTab {
	return value === "media" || value === "intake" || value === "bumpers";
}

export function getBrowserWorkspaceStorage(): BrowserWorkspaceStorage | null {
	if (typeof window === "undefined") {
		return null;
	}

	return {
		locationHref: window.location.href,
		selectedChannelId: window.localStorage.getItem(
			SELECTED_CHANNEL_STORAGE_KEY,
		),
	};
}

export function getInitialWorkspaceTab(
	storage: BrowserWorkspaceStorage | null,
): WorkspaceTab {
	if (!storage) {
		return "media";
	}

	const tab = new URL(storage.locationHref).searchParams.get("tab");
	return tab === "intake" || tab === "bumpers" ? tab : "media";
}

export function getInitialSelectedVideoId(input: {
	readonly requestedVideoId?: string | null;
	readonly storage: BrowserWorkspaceStorage | null;
}): string | null {
	if (input.requestedVideoId) {
		return input.requestedVideoId;
	}

	if (!input.storage) {
		return null;
	}

	return new URL(input.storage.locationHref).searchParams.get("videoId");
}

export function getInitialSelectedChannelId(
	storage: BrowserWorkspaceStorage | null,
): string | null {
	return storage?.selectedChannelId ?? null;
}

export function getDashboardSelectedVideoId(input: {
	readonly selectedVideoId: string | null;
	readonly selectedChannelId: string | null;
	readonly selectedVideoChannelId: string | null;
}): string | undefined {
	if (
		input.selectedVideoId &&
		(!input.selectedChannelId ||
			input.selectedVideoChannelId === input.selectedChannelId)
	) {
		return input.selectedVideoId;
	}

	return undefined;
}

export function getSelectedVideoFromDashboard(input: {
	readonly dataMatchesSelectedChannel: boolean;
	readonly selectedVideo?: ContentClipDashboardSelectedVideo | null;
}): ContentClipDashboardSelectedVideo | null {
	return input.dataMatchesSelectedChannel && input.selectedVideo
		? input.selectedVideo
		: null;
}

export function getDashboardVideos(input: {
	readonly dataMatchesSelectedChannel: boolean;
	readonly videos?: ContentClipDashboardVideo[] | null;
}): ContentClipDashboardVideo[] {
	return input.dataMatchesSelectedChannel ? (input.videos ?? []) : [];
}

export function shouldShowFloatingJobButton(input: {
	readonly workspaceTab: WorkspaceTab;
	readonly selectedVideoJobs: readonly SelectedVideoJob[];
	readonly activeVideoJobCount: number;
}): boolean {
	if (input.workspaceTab === "media") {
		return input.selectedVideoJobs.length > 0 || input.activeVideoJobCount > 0;
	}

	return input.activeVideoJobCount > 0;
}

export function buildWorkspaceBrowserUrl(input: {
	readonly locationHref: string;
	readonly selectedVideoId: string | null;
	readonly workspaceTab: WorkspaceTab;
}): string {
	const url = new URL(input.locationHref);
	if (input.selectedVideoId) {
		url.searchParams.set("videoId", input.selectedVideoId);
	} else {
		url.searchParams.delete("videoId");
	}

	if (input.workspaceTab === "media") {
		url.searchParams.delete("tab");
	} else {
		url.searchParams.set("tab", input.workspaceTab);
	}

	return url.toString();
}

export function getWorkspaceTabFromBrowserUrl(
	locationHref: string,
): WorkspaceTab {
	const tab = new URL(locationHref).searchParams.get("tab");
	return isWorkspaceTab(tab) ? tab : "media";
}

export function getManualClipTiming(input: {
	readonly currentTime: number;
	readonly durationSeconds: number | null;
	readonly frameRate: number | null;
}): { startSeconds: number; endSeconds: number } {
	const durationSeconds = input.durationSeconds ?? 60;
	const startSeconds = roundToFrame(
		Math.min(Math.max(0, input.currentTime), Math.max(0, durationSeconds - 5)),
		input.frameRate,
	);
	const endSeconds = roundToFrame(
		Math.min(durationSeconds, startSeconds + 60),
		input.frameRate,
	);

	return {
		startSeconds,
		endSeconds: Math.max(startSeconds + 1, endSeconds),
	};
}

export function getYoutubeChapterText(
	selectedVideo: ContentClipDashboardSelectedVideo | null,
): string {
	return selectedVideo
		? buildYoutubeChapterText(selectedVideo.chapters, formatTimecode)
		: "";
}
