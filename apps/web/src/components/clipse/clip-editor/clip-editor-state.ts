import {
	type ClipDraftState,
	canGenerateClipMetadata,
	canRenderClip,
} from "~/modules/content-clips/application/clip-draft";
import {
	parseTimecode,
	roundToFrame,
} from "~/modules/content-clips/application/clip-timing";
import type { ClipItem } from "~/modules/content-videos/application/content-clip-dashboard-view";

export type ClipSaveInput = ClipDraftState & {
	readonly id: string;
};

export interface ClipPreviewWindow {
	readonly clipStartSeconds: number;
	readonly durationSeconds: number;
	readonly clipEndSeconds: number;
	readonly previewUrl: string;
}

export function getClipDraft(clip: ClipItem): ClipDraftState {
	return {
		title: clip.title,
		hook: clip.hook,
		summary: clip.summary,
		startSeconds: clip.startSeconds,
		endSeconds: clip.endSeconds,
	};
}

export function hasClipDraftChanges(
	draft: ClipDraftState,
	clip: Pick<
		ClipItem,
		"title" | "hook" | "summary" | "startSeconds" | "endSeconds"
	>,
): boolean {
	return (
		draft.title !== clip.title ||
		draft.hook !== clip.hook ||
		draft.summary !== clip.summary ||
		draft.startSeconds !== clip.startSeconds ||
		draft.endSeconds !== clip.endSeconds
	);
}

export function isClipRendering(clip: Pick<ClipItem, "status" | "renderJob">) {
	return !canRenderClip({
		status: clip.status,
		renderJob: clip.renderJob,
		mutationPending: false,
		hasChanges: false,
	});
}

export function canGenerateDraftMetadata(input: {
	readonly clip: Pick<ClipItem, "rationale">;
	readonly mutationPending: boolean;
	readonly isRendering: boolean;
	readonly startSeconds: number;
	readonly endSeconds: number;
}): boolean {
	return canGenerateClipMetadata({
		rationale: input.clip.rationale,
		mutationPending: input.mutationPending,
		isRendering: input.isRendering,
		startSeconds: input.startSeconds,
		endSeconds: input.endSeconds,
	});
}

export function buildClipSaveInput(
	clipId: string,
	draft: ClipDraftState,
): ClipSaveInput {
	return {
		id: clipId,
		...draft,
	};
}

export function getBoundedClipTime(input: {
	readonly seconds: number;
	readonly maxDurationSeconds: number;
}): number {
	return Math.max(0, Math.min(input.maxDurationSeconds, input.seconds));
}

export function getBoundedPlayerSeekTime(input: {
	readonly seconds: number;
	readonly durationSeconds: number;
}): number {
	return Math.max(
		0,
		Math.min(input.durationSeconds || input.seconds, input.seconds),
	);
}

export function getClipPreviewWindow(input: {
	readonly sourceUrl: string;
	readonly renderedUrl?: string | null;
	readonly startSeconds: number;
	readonly endSeconds: number;
	readonly renderedDurationSeconds: number | null;
}): ClipPreviewWindow {
	const isRenderedPreview = Boolean(input.renderedUrl);
	const clipStartSeconds = isRenderedPreview ? 0 : input.startSeconds;
	const durationSeconds = Math.max(
		0.1,
		isRenderedPreview
			? (input.renderedDurationSeconds ?? input.endSeconds - input.startSeconds)
			: input.endSeconds - input.startSeconds,
	);
	const clipEndSeconds = isRenderedPreview ? durationSeconds : input.endSeconds;

	return {
		clipStartSeconds,
		durationSeconds,
		clipEndSeconds,
		previewUrl:
			input.renderedUrl ??
			`${input.sourceUrl}#t=${input.startSeconds.toFixed(3)},${input.endSeconds.toFixed(3)}`,
	};
}

export function commitStartTimecode(input: {
	readonly value: string;
	readonly currentStartSeconds: number;
	readonly currentEndSeconds: number;
	readonly frameRate: number | null;
}): number {
	const parsed = parseTimecode(input.value);
	if (parsed === null || parsed >= input.currentEndSeconds) {
		return input.currentStartSeconds;
	}

	return roundToFrame(Math.max(0, parsed), input.frameRate);
}

export function commitEndTimecode(input: {
	readonly value: string;
	readonly currentStartSeconds: number;
	readonly currentEndSeconds: number;
	readonly maxDurationSeconds: number;
	readonly frameRate: number | null;
}): number {
	const parsed = parseTimecode(input.value);
	if (parsed === null || parsed <= input.currentStartSeconds) {
		return input.currentEndSeconds;
	}

	return roundToFrame(
		Math.min(input.maxDurationSeconds, parsed),
		input.frameRate,
	);
}
