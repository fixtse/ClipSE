"use client";

import { useState } from "react";
import {
	getBrowserWorkspaceStorage,
	getInitialSelectedChannelId,
	getInitialSelectedVideoId,
	getInitialWorkspaceTab,
	type WorkspaceTab,
} from "./workspace-state";

export type { WorkspaceTab } from "./workspace-state";

export function useContentClipWorkspaceController(input: {
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

	return {
		selectedVideoId,
		setSelectedVideoId,
		selectedVideoChannelId,
		setSelectedVideoChannelId,
		selectedChannelId,
		setSelectedChannelId,
		workspaceTab,
		setWorkspaceTab,
	};
}
