"use client";

import { useState } from "react";
import {
	type ClipListTab,
	getBrowserWorkspaceStorage,
	getInitialClipListTab,
	getInitialSelectedChannelId,
	getInitialSelectedClipId,
	getInitialSelectedVideoId,
	getInitialWorkspaceTab,
	type WorkspaceTab,
} from "./workspace-state";

export type { WorkspaceTab } from "./workspace-state";

export function useClipSEWorkspaceController(input: {
	requestedVideoId?: string | null;
}) {
	const browserStorage = getBrowserWorkspaceStorage();
	const [selectedVideoId, setSelectedVideoId] = useState<string | null>(() =>
		getInitialSelectedVideoId({
			requestedVideoId: input.requestedVideoId,
			storage: browserStorage,
		}),
	);
	const [selectedVideoChannelId, setSelectedVideoChannelId] = useState<
		string | null
	>(null);
	const [selectedChannelId, setSelectedChannelId] = useState<string | null>(
		() => getInitialSelectedChannelId(browserStorage),
	);
	const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>(() =>
		getInitialWorkspaceTab(browserStorage),
	);
	const [clipListTab, setClipListTab] = useState<ClipListTab>(() =>
		getInitialClipListTab(browserStorage),
	);
	const [selectedClipId, setSelectedClipId] = useState<string | null>(() =>
		getInitialSelectedClipId(browserStorage),
	);

	return {
		selectedVideoId,
		setSelectedVideoId,
		selectedVideoChannelId,
		setSelectedVideoChannelId,
		selectedChannelId,
		setSelectedChannelId,
		workspaceTab,
		setWorkspaceTab,
		clipListTab,
		setClipListTab,
		selectedClipId,
		setSelectedClipId,
	};
}
