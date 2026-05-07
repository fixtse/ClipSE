import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
	useContentClipWorkspaceController,
	type WorkspaceTab,
} from "~/components/contentclip/useContentClipWorkspaceController";
import { SELECTED_CHANNEL_STORAGE_KEY } from "~/modules/content-videos/application/content-clip-dashboard-view";

interface CapturedControllerState {
	selectedVideoId: string | null;
	selectedVideoChannelId: string | null;
	selectedChannelId: string | null;
	workspaceTab: WorkspaceTab;
}

function captureControllerState(input: {
	requestedVideoId?: string | null;
}): CapturedControllerState {
	let capturedState: CapturedControllerState | null = null;

	function Harness() {
		const controller = useContentClipWorkspaceController(input);
		capturedState = {
			selectedVideoId: controller.selectedVideoId,
			selectedVideoChannelId: controller.selectedVideoChannelId,
			selectedChannelId: controller.selectedChannelId,
			workspaceTab: controller.workspaceTab,
		};

		return null;
	}

	renderToStaticMarkup(<Harness />);
	if (!capturedState) {
		throw new Error("Controller state was not captured.");
	}

	return capturedState;
}

function stubWindow(input: {
	href: string;
	selectedChannelId?: string | null;
}) {
	vi.stubGlobal("window", {
		location: {
			href: input.href,
		},
		localStorage: {
			getItem: vi.fn((key: string) =>
				key === SELECTED_CHANNEL_STORAGE_KEY
					? (input.selectedChannelId ?? null)
					: null,
			),
		},
	});
}

describe("useContentClipWorkspaceController", () => {
	it("uses media defaults when rendering without a browser window", () => {
		const state = captureControllerState({});

		expect(state).toEqual({
			selectedVideoId: null,
			selectedVideoChannelId: null,
			selectedChannelId: null,
			workspaceTab: "media",
		});
	});

	it("prefers requested video ids over URL video ids", () => {
		stubWindow({
			href: "https://contentclip.test/en?tab=intake&videoId=url-video",
			selectedChannelId: "channel-id",
		});

		const state = captureControllerState({
			requestedVideoId: "requested-video",
		});

		expect(state).toEqual({
			selectedVideoId: "requested-video",
			selectedVideoChannelId: null,
			selectedChannelId: "channel-id",
			workspaceTab: "intake",
		});
	});

	it("falls back to URL video ids and normalizes unsupported tabs", () => {
		stubWindow({
			href: "https://contentclip.test/en?tab=unknown&videoId=url-video",
		});

		expect(captureControllerState({ requestedVideoId: null })).toMatchObject({
			selectedVideoId: "url-video",
			selectedChannelId: null,
			workspaceTab: "media",
		});
	});

	it("initializes the bumpers workspace tab from the URL", () => {
		stubWindow({
			href: "https://contentclip.test/en?tab=bumpers",
		});

		expect(captureControllerState({}).workspaceTab).toBe("bumpers");
	});
});
