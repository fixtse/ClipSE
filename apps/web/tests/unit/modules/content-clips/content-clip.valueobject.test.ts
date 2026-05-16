import { describe, expect, it } from "vitest";
import {
	ClipSESchema,
	CreateClipSESchema,
	getClipDurationSeconds,
	normalizeClipCandidate,
	parseClipSERenderOptions,
	UpdateClipSESchema,
} from "~/modules/content-clips/domain/content-clip.valueobject";
import {
	ClipSEMother,
	GeneratedClipCandidateMother,
} from "../../../mothers/domain-mothers";

describe("normalizeClipCandidate", () => {
	it("preserves sub-second precision and enforces a minimum duration", () => {
		const clip = normalizeClipCandidate(
			GeneratedClipCandidateMother.create({
				startSeconds: 12.3419,
				endSeconds: 17.1114,
				score: 76.4,
			}),
			120,
		);

		expect(clip.startSeconds).toBe(12.342);
		expect(clip.endSeconds).toBe(32.342);
		expect(clip.score).toBe(76);
		expect(getClipDurationSeconds(clip)).toBe(20);
	});

	it("caps the clip end time at the source duration", () => {
		const clip = normalizeClipCandidate(
			GeneratedClipCandidateMother.create({
				startSeconds: 94.8,
				endSeconds: 101.2,
				score: 88,
			}),
			100,
		);

		expect(clip.startSeconds).toBe(94.8);
		expect(clip.endSeconds).toBe(100);
	});

	it("normalizes negative start time and keeps the minimum duration without a source duration", () => {
		const clip = normalizeClipCandidate(
			GeneratedClipCandidateMother.create({
				startSeconds: -4,
				endSeconds: 7,
				score: 61.5,
			}),
			null,
		);

		expect(clip.startSeconds).toBe(0);
		expect(clip.endSeconds).toBe(20);
		expect(clip.score).toBe(62);
	});

	it("returns zero for reversed durations", () => {
		expect(getClipDurationSeconds({ startSeconds: 10, endSeconds: 4 })).toBe(0);
	});
});

describe("parseClipSERenderOptions", () => {
	it("uses source render defaults", () => {
		expect(parseClipSERenderOptions({})).toEqual({
			aspectMode: "source",
			burnSubtitles: false,
			focusMode: undefined,
		});
	});

	it("defaults vertical renders to auto speaker focus", () => {
		expect(
			parseClipSERenderOptions({
				aspectMode: "vertical9x16",
				burnSubtitles: true,
			}),
		).toEqual({
			aspectMode: "vertical9x16",
			burnSubtitles: true,
			focusMode: "auto-speaker",
		});
	});

	it("rejects invalid render options", () => {
		expect(() =>
			parseClipSERenderOptions({
				aspectMode: "square",
				burnSubtitles: "yes",
			}),
		).toThrow();
	});
});

describe("content clip short fields", () => {
	it("accepts clip kind and short detection mode on clip records", () => {
		expect(
			ClipSESchema.parse(
				ClipSEMother.create({
					clipKind: "short",
					shortDetectionMode: "people_and_screen",
				}),
			),
		).toMatchObject({
			clipKind: "short",
			shortDetectionMode: "people_and_screen",
		});
	});

	it("defaults manual clips to standard people detection", () => {
		expect(
			CreateClipSESchema.parse({
				videoId: "11111111-1111-4111-8111-111111111111",
				title: "Manual clip",
				hook: "",
				summary: "",
				startSeconds: 1,
				endSeconds: 20,
			}),
		).toMatchObject({
			clipKind: "standard",
			shortDetectionMode: "people",
		});
	});

	it("accepts detection-only updates for shorts", () => {
		expect(
			UpdateClipSESchema.parse({
				id: "33333333-3333-4333-8333-333333333333",
				shortDetectionMode: "screen_only",
			}),
		).toEqual({
			id: "33333333-3333-4333-8333-333333333333",
			shortDetectionMode: "screen_only",
		});
	});

	it("accepts product view detection for tabletop shorts", () => {
		expect(
			UpdateClipSESchema.parse({
				id: "33333333-3333-4333-8333-333333333333",
				shortDetectionMode: "product_view",
			}),
		).toEqual({
			id: "33333333-3333-4333-8333-333333333333",
			shortDetectionMode: "product_view",
		});
	});
});
