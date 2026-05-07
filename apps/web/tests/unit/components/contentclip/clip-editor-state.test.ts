import { describe, expect, it } from "vitest";
import {
	buildClipSaveInput,
	canGenerateDraftMetadata,
	commitEndTimecode,
	commitStartTimecode,
	getBoundedClipTime,
	getBoundedPlayerSeekTime,
	getClipDraft,
	getClipPreviewWindow,
	hasClipDraftChanges,
	isClipRendering,
} from "~/components/contentclip/clip-editor/clip-editor-state";
import { DashboardClipMother } from "../../../mothers/domain-mothers";

describe("clip editor state helpers", () => {
	it("builds drafts from clips and detects every edited field", () => {
		const clip = DashboardClipMother.create({
			title: "Title",
			hook: "Hook",
			summary: "Summary",
			startSeconds: 1,
			endSeconds: 11,
		});
		const draft = getClipDraft(clip);

		expect(draft).toEqual({
			title: "Title",
			hook: "Hook",
			summary: "Summary",
			startSeconds: 1,
			endSeconds: 11,
		});
		expect(hasClipDraftChanges(draft, clip)).toBe(false);
		expect(hasClipDraftChanges({ ...draft, title: "Updated" }, clip)).toBe(
			true,
		);
		expect(hasClipDraftChanges({ ...draft, hook: "Updated" }, clip)).toBe(true);
		expect(hasClipDraftChanges({ ...draft, summary: "Updated" }, clip)).toBe(
			true,
		);
		expect(hasClipDraftChanges({ ...draft, startSeconds: 2 }, clip)).toBe(true);
		expect(hasClipDraftChanges({ ...draft, endSeconds: 12 }, clip)).toBe(true);
	});

	it("builds the save input from the current draft", () => {
		expect(
			buildClipSaveInput("clip-1", {
				title: "Title",
				hook: "Hook",
				summary: "Updated notes",
				startSeconds: 2,
				endSeconds: 7,
			}),
		).toEqual({
			id: "clip-1",
			title: "Title",
			hook: "Hook",
			summary: "Updated notes",
			startSeconds: 2,
			endSeconds: 7,
		});
	});

	it("normalizes rendering and AI metadata eligibility", () => {
		expect(
			isClipRendering(
				DashboardClipMother.create({
					status: "ready",
					renderJob: null,
				}),
			),
		).toBe(false);
		expect(
			isClipRendering(
				DashboardClipMother.create({
					status: "queued",
					renderJob: null,
				}),
			),
		).toBe(true);
		expect(
			isClipRendering(
				DashboardClipMother.create({
					renderJob: {
						id: "job-id",
						message: null,
						progress: 10,
						status: "running",
					},
					status: "suggested",
				}),
			),
		).toBe(true);
		expect(
			canGenerateDraftMetadata({
				clip: DashboardClipMother.create({ rationale: "Manual clip" }),
				mutationPending: false,
				isRendering: false,
				startSeconds: 1,
				endSeconds: 2,
			}),
		).toBe(true);
		expect(
			canGenerateDraftMetadata({
				clip: DashboardClipMother.create({ rationale: "Manual clip" }),
				mutationPending: false,
				isRendering: false,
				startSeconds: 1,
				endSeconds: 1.5,
			}),
		).toBe(false);
		expect(
			canGenerateDraftMetadata({
				clip: DashboardClipMother.create({ rationale: "AI selected" }),
				mutationPending: false,
				isRendering: false,
				startSeconds: 1,
				endSeconds: 3,
			}),
		).toBe(false);
		expect(
			canGenerateDraftMetadata({
				clip: DashboardClipMother.create({ rationale: "Manual clip" }),
				mutationPending: true,
				isRendering: false,
				startSeconds: 1,
				endSeconds: 3,
			}),
		).toBe(false);
	});

	it("bounds source seeking and committed timecode values", () => {
		expect(getBoundedClipTime({ seconds: -3, maxDurationSeconds: 120 })).toBe(
			0,
		);
		expect(getBoundedClipTime({ seconds: 130, maxDurationSeconds: 120 })).toBe(
			120,
		);
		expect(getBoundedPlayerSeekTime({ seconds: 30, durationSeconds: 10 })).toBe(
			10,
		);
		expect(getBoundedPlayerSeekTime({ seconds: 30, durationSeconds: 0 })).toBe(
			30,
		);
		expect(
			commitStartTimecode({
				value: "0:02",
				currentStartSeconds: 1,
				currentEndSeconds: 10,
				frameRate: 30,
			}),
		).toBe(2);
		expect(
			commitStartTimecode({
				value: "-1",
				currentStartSeconds: 1,
				currentEndSeconds: 10,
				frameRate: 30,
			}),
		).toBe(1);
		expect(
			commitStartTimecode({
				value: "0:12",
				currentStartSeconds: 1,
				currentEndSeconds: 10,
				frameRate: 30,
			}),
		).toBe(1);
		expect(
			commitStartTimecode({
				value: "bad",
				currentStartSeconds: 1,
				currentEndSeconds: 10,
				frameRate: 30,
			}),
		).toBe(1);
		expect(
			commitEndTimecode({
				value: "0:00",
				currentStartSeconds: 1,
				currentEndSeconds: 10,
				maxDurationSeconds: 15,
				frameRate: null,
			}),
		).toBe(10);
		expect(
			commitEndTimecode({
				value: "0:20",
				currentStartSeconds: 1,
				currentEndSeconds: 10,
				maxDurationSeconds: 15,
				frameRate: null,
			}),
		).toBe(15);
		expect(
			commitEndTimecode({
				value: "bad",
				currentStartSeconds: 1,
				currentEndSeconds: 10,
				maxDurationSeconds: 15,
				frameRate: null,
			}),
		).toBe(10);
	});

	it("derives source and rendered preview playback windows", () => {
		expect(
			getClipPreviewWindow({
				sourceUrl: "https://media.test/source.mp4",
				renderedUrl: null,
				startSeconds: 10,
				endSeconds: 20,
				renderedDurationSeconds: null,
			}),
		).toEqual({
			clipStartSeconds: 10,
			durationSeconds: 10,
			clipEndSeconds: 20,
			previewUrl: "https://media.test/source.mp4#t=10.000,20.000",
		});

		expect(
			getClipPreviewWindow({
				sourceUrl: "https://media.test/source.mp4",
				renderedUrl: "/api/content/clips/clip-id/source",
				startSeconds: 10,
				endSeconds: 20,
				renderedDurationSeconds: 8,
			}),
		).toEqual({
			clipStartSeconds: 0,
			durationSeconds: 8,
			clipEndSeconds: 8,
			previewUrl: "/api/content/clips/clip-id/source",
		});

		expect(
			getClipPreviewWindow({
				sourceUrl: "https://media.test/source.mp4",
				renderedUrl: "/api/content/clips/clip-id/source",
				startSeconds: 10,
				endSeconds: 10,
				renderedDurationSeconds: null,
			}).durationSeconds,
		).toBe(0.1);
	});
});
