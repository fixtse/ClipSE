import { describe, expect, it } from "vitest";
import {
	getClipDurationSeconds,
	normalizeClipCandidate,
} from "~/modules/content-clips/domain/content-clip.valueobject";
import { GeneratedClipCandidateMother } from "../../../mothers/domain-mothers";

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
