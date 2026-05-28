import { describe, expect, it } from "vitest";
import {
	type ClipDraftState,
	canGenerateClipMetadata,
	canRenderClip,
	pushClipDraftUndoSnapshot,
	redoClipDraft,
	undoClipDraft,
} from "~/modules/content-clips/application/clip-draft";

const draft = (title: string): ClipDraftState => ({
	title,
	hook: "",
	summary: "",
	startSeconds: 0,
	endSeconds: 10,
});

describe("clip draft helpers", () => {
	it("maintains undo and redo history", () => {
		const first = draft("first");
		const second = draft("second");
		const history = pushClipDraftUndoSnapshot(
			{ undoStack: [], redoStack: [] },
			first,
		);

		const undone = undoClipDraft(history, second);
		expect(undone?.draft).toEqual(first);
		expect(undone?.history.redoStack).toEqual([second]);

		const redone = undone ? redoClipDraft(undone.history, first) : null;
		expect(redone?.draft).toEqual(second);
		expect(redone?.history.undoStack).toEqual([first]);
	});

	it("checks render eligibility", () => {
		expect(
			canRenderClip({
				status: "ready",
				renderJob: null,
				mutationPending: false,
				hasChanges: false,
			}),
		).toBe(true);
		expect(
			canRenderClip({
				status: "rendering",
				renderJob: null,
				mutationPending: false,
				hasChanges: false,
			}),
		).toBe(false);
	});

	it("checks metadata generation eligibility", () => {
		expect(
			canGenerateClipMetadata({
				rationale: "Manual clip",
				mutationPending: false,
				isRendering: false,
				startSeconds: 1,
				endSeconds: 3,
			}),
		).toBe(true);
		expect(
			canGenerateClipMetadata({
				rationale: "AI clip",
				mutationPending: false,
				isRendering: false,
				startSeconds: 1,
				endSeconds: 3,
			}),
		).toBe(false);
	});
});
