import { describe, expect, it } from "vitest";
import { buildFocusPlan } from "~/server/lib/contentclip-focus";

describe("buildFocusPlan", () => {
	it("falls back to the centered crop when no detections are available", () => {
		expect(
			buildFocusPlan({
				detections: [],
				frameWidth: 1920,
				frameHeight: 1080,
			}),
		).toEqual({
			regions: [
				{
					centerX: 960,
					centerY: 540,
					score: 1,
					detectionCount: 0,
				},
			],
			fallback: true,
			detectorBackend: "opencv",
		});
	});

	it("clusters detections into one stable focus area", () => {
		const plan = buildFocusPlan({
			frameWidth: 1920,
			frameHeight: 1080,
			detections: [
				{
					timestampSeconds: 0,
					x: 700,
					y: 100,
					width: 220,
					height: 280,
					score: 0.8,
					source: "person",
				},
				{
					timestampSeconds: 1,
					x: 730,
					y: 110,
					width: 220,
					height: 280,
					score: 0.6,
					source: "person",
				},
			],
			detectorBackend: "yolo-cuda",
		});

		expect(plan.fallback).toBe(false);
		expect(plan.detectorBackend).toBe("yolo-cuda");
		expect(plan.regions).toHaveLength(1);
		const region = plan.regions[0];
		expect(region).toBeDefined();
		expect(region?.detectionCount).toBe(2);
		expect(region?.centerX).toBeGreaterThan(800);
		expect(region?.centerX).toBeLessThan(850);
	});

	it("keeps two strong focus areas and clamps centers to the frame", () => {
		const plan = buildFocusPlan({
			frameWidth: 1920,
			frameHeight: 1080,
			detections: [
				{
					timestampSeconds: 0,
					x: -40,
					y: 80,
					width: 240,
					height: 300,
					score: 1,
					source: "face",
				},
				{
					timestampSeconds: 0,
					x: 1680,
					y: 100,
					width: 260,
					height: 300,
					score: 0.8,
					source: "face",
				},
			],
		});

		expect(plan.regions).toHaveLength(2);
		expect(plan.regions[0]?.centerX).toBeGreaterThanOrEqual(0);
		expect(plan.regions[1]?.centerX).toBeLessThanOrEqual(1920);
	});
});
