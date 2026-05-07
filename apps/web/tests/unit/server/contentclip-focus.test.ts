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
					width: null,
					height: null,
					score: 1,
					detectionCount: 0,
				},
			],
			fallback: true,
			detectorBackend: "opencv",
			windows: [
				{
					startSeconds: 0,
					endSeconds: 1,
					regions: [
						{
							centerX: 960,
							centerY: 540,
							width: null,
							height: null,
							score: 1,
							detectionCount: 0,
						},
					],
				},
			],
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
		expect(region?.detectionCount).toBeGreaterThanOrEqual(1);
		expect(region?.centerX).toBeGreaterThan(800);
		expect(region?.centerX).toBeLessThan(850);
		expect(region?.width).toBeGreaterThanOrEqual(220);
	});

	it("builds separate focus windows when scenes move inside one clip", () => {
		const plan = buildFocusPlan({
			frameWidth: 1920,
			frameHeight: 1080,
			clipStartSeconds: 10,
			clipEndSeconds: 13,
			detections: [
				{
					timestampSeconds: 10,
					x: 100,
					y: 100,
					width: 260,
					height: 420,
					score: 0.9,
					source: "person-group",
				},
				{
					timestampSeconds: 11,
					x: 1180,
					y: 90,
					width: 300,
					height: 440,
					score: 0.9,
					source: "person-group",
				},
				{
					timestampSeconds: 12,
					x: 1220,
					y: 95,
					width: 300,
					height: 440,
					score: 0.8,
					source: "person-group",
				},
			],
		});

		expect(plan.windows).toHaveLength(2);
		expect(plan.windows[0]?.startSeconds).toBe(10);
		expect(plan.windows[0]?.endSeconds).toBe(10.5);
		expect(plan.windows[1]?.startSeconds).toBe(10.5);
		expect(plan.windows[1]?.endSeconds).toBe(13);
	});

	it("ignores brief focus jumps that return to the previous speaker", () => {
		const plan = buildFocusPlan({
			frameWidth: 1920,
			frameHeight: 1080,
			clipStartSeconds: 0,
			clipEndSeconds: 1.75,
			detections: [
				{
					timestampSeconds: 0,
					x: 360,
					y: 120,
					width: 320,
					height: 480,
					score: 0.9,
					source: "person-group",
				},
				{
					timestampSeconds: 0.35,
					x: 370,
					y: 120,
					width: 320,
					height: 480,
					score: 0.9,
					source: "person-group",
				},
				{
					timestampSeconds: 0.7,
					x: 1200,
					y: 120,
					width: 320,
					height: 480,
					score: 0.75,
					source: "person-group",
				},
				{
					timestampSeconds: 1.05,
					x: 365,
					y: 120,
					width: 320,
					height: 480,
					score: 0.9,
					source: "person-group",
				},
				{
					timestampSeconds: 1.4,
					x: 375,
					y: 120,
					width: 320,
					height: 480,
					score: 0.9,
					source: "person-group",
				},
			],
		});

		expect(plan.windows).toHaveLength(1);
		expect(plan.windows[0]?.startSeconds).toBe(0);
		expect(plan.windows[0]?.endSeconds).toBe(1.75);
		expect(plan.windows[0]?.regions).toHaveLength(1);
		expect(plan.windows[0]?.regions[0]?.centerX).toBeLessThan(600);
	});

	it("keeps two-panel regions ordered left to right even when right scores higher", () => {
		const plan = buildFocusPlan({
			frameWidth: 1920,
			frameHeight: 1080,
			detections: [
				{
					timestampSeconds: 0,
					x: 1350,
					y: 100,
					width: 300,
					height: 500,
					score: 0.95,
					source: "person-group",
				},
				{
					timestampSeconds: 0,
					x: 160,
					y: 120,
					width: 320,
					height: 520,
					score: 0.6,
					source: "person-group",
				},
			],
		});

		expect(plan.windows[0]?.regions).toHaveLength(2);
		expect(plan.windows[0]?.regions[0]?.centerX).toBeLessThan(
			plan.windows[0]?.regions[1]?.centerX ?? 0,
		);
	});

	it("preserves grouped person bounds for shared-panel crops", () => {
		const plan = buildFocusPlan({
			frameWidth: 1920,
			frameHeight: 1080,
			detectorBackend: "yolo-cuda",
			detections: [
				{
					timestampSeconds: 0,
					x: 100,
					y: 120,
					width: 760,
					height: 520,
					score: 0.9,
					source: "person-group",
				},
				{
					timestampSeconds: 0,
					x: 1350,
					y: 100,
					width: 320,
					height: 560,
					score: 0.8,
					source: "person-group",
				},
			],
		});

		expect(plan.regions).toHaveLength(2);
		expect(plan.regions[0]?.width).toBe(760);
		expect(plan.regions[1]?.width).toBe(320);
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
