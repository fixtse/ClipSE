export interface ClipDraftState {
	title: string;
	hook: string;
	summary: string;
	startSeconds: number;
	endSeconds: number;
}

export interface ClipDraftHistory {
	undoStack: ClipDraftState[];
	redoStack: ClipDraftState[];
}

const MAX_HISTORY_ITEMS = 25;

export function pushClipDraftUndoSnapshot(
	history: ClipDraftHistory,
	currentDraft: ClipDraftState,
): ClipDraftHistory {
	return {
		undoStack: [
			...history.undoStack.slice(-(MAX_HISTORY_ITEMS - 1)),
			currentDraft,
		],
		redoStack: [],
	};
}

export function undoClipDraft(
	history: ClipDraftHistory,
	currentDraft: ClipDraftState,
): { draft: ClipDraftState; history: ClipDraftHistory } | null {
	const previous = history.undoStack.at(-1);
	if (!previous) {
		return null;
	}

	return {
		draft: previous,
		history: {
			undoStack: history.undoStack.slice(0, -1),
			redoStack: [
				...history.redoStack.slice(-(MAX_HISTORY_ITEMS - 1)),
				currentDraft,
			],
		},
	};
}

export function redoClipDraft(
	history: ClipDraftHistory,
	currentDraft: ClipDraftState,
): { draft: ClipDraftState; history: ClipDraftHistory } | null {
	const next = history.redoStack.at(-1);
	if (!next) {
		return null;
	}

	return {
		draft: next,
		history: {
			undoStack: [
				...history.undoStack.slice(-(MAX_HISTORY_ITEMS - 1)),
				currentDraft,
			],
			redoStack: history.redoStack.slice(0, -1),
		},
	};
}

export function canRenderClip(input: {
	status: string;
	renderJob?: { status: string } | null;
	mutationPending: boolean;
	hasChanges: boolean;
}): boolean {
	const isRendering =
		input.status === "queued" ||
		input.status === "rendering" ||
		input.renderJob?.status === "pending" ||
		input.renderJob?.status === "running";

	return !input.mutationPending && !input.hasChanges && !isRendering;
}

export function canGenerateClipMetadata(input: {
	rationale: string;
	mutationPending: boolean;
	isRendering: boolean;
	startSeconds: number;
	endSeconds: number;
}): boolean {
	return (
		input.rationale === "Manual clip" &&
		!input.mutationPending &&
		!input.isRendering &&
		input.endSeconds > input.startSeconds &&
		input.endSeconds - input.startSeconds >= 1
	);
}
