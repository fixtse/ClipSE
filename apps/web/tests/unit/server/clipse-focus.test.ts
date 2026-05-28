import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildFocusPlan, detectFocusRegions } from "~/server/lib/clipse-focus";

const { execFileMock } = vi.hoisted(() => ({
	execFileMock: vi.fn(),
}));

vi.mock("node:child_process", () => {
	const promisifiedExecFile = Symbol.for("nodejs.util.promisify.custom");
	(
		execFileMock as typeof execFileMock & {
			[promisifiedExecFile]: (...params: unknown[]) => Promise<{
				stdout: string;
				stderr: string;
			}>;
		}
	)[promisifiedExecFile] = async (...params: unknown[]) =>
		await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
			execFileMock(
				...params,
				(error: Error | null, stdout?: string, stderr?: string) => {
					if (error) {
						reject(error);
						return;
					}
					resolve({ stdout: stdout ?? "", stderr: stderr ?? "" });
				},
			);
		});
	return {
		execFile: execFileMock,
	};
});

function mockLocalFocusDetector() {
	execFileMock.mockImplementation((...params: unknown[]) => {
		const callback = params.at(-1) as (
			error: Error | null,
			stdout?: string,
			stderr?: string,
		) => void;
		callback(
			null,
			JSON.stringify({
				detections: [
					{
						timestampSeconds: 1,
						x: 100,
						y: 90,
						width: 240,
						height: 360,
						score: 0.8,
						source: "person",
					},
				],
				detectorBackend: "yolo-cpu",
			}),
			"",
		);
	});
}

describe("buildFocusPlan", () => {
	afterEach(() => {
		execFileMock.mockReset();
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
	});

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

	it("sends the selected detection mode to Hailo vision focus detection", async () => {
		vi.stubEnv("CLIPSE_FOCUS_PROVIDER", "hailo-vision");
		vi.stubEnv("CLIPSE_HAILO_SERVICE_URL", "http://hailo.test");
		const workspace = await mkdtemp(join(tmpdir(), "clipse-focus-test-"));
		const inputFilePath = join(workspace, "source.mp4");
		await writeFile(inputFilePath, Buffer.from("video"));
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			const body = init?.body as FormData;
			expect(body.get("detection_mode")).toBe("product");
			expect(body.get("detector_backend")).toBe("hailo-vision");
			expect(body.get("start_seconds")).toBe("1.000");
			expect(body.get("end_seconds")).toBe("2.000");
			return new Response(
				JSON.stringify({
					detections: [
						{
							timestampSeconds: 1,
							x: 80,
							y: 90,
							width: 260,
							height: 220,
							score: 0.9,
							source: "product",
						},
					],
					detectorBackend: "hailo-vision",
				}),
				{ status: 200 },
			);
		});
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			detectFocusRegions({
				inputFilePath,
				startSeconds: 1,
				endSeconds: 2,
				frameWidth: 1920,
				frameHeight: 1080,
				detectionMode: "product",
			}),
		).resolves.toMatchObject({
			fallback: false,
			detectorBackend: "hailo-vision",
		});
		expect(fetchMock).toHaveBeenCalledWith(
			"http://hailo.test/focus-detections",
			expect.objectContaining({ method: "POST" }),
		);
		expect(execFileMock).not.toHaveBeenCalled();
	});

	it("falls back to local focus detection when Hailo returns no detections", async () => {
		vi.stubEnv("CLIPSE_FOCUS_PROVIDER", "hailo-vision");
		const workspace = await mkdtemp(join(tmpdir(), "clipse-focus-test-"));
		const inputFilePath = join(workspace, "source.mp4");
		await writeFile(inputFilePath, Buffer.from("video"));
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							detections: [],
							detectorBackend: "hailo-vision",
						}),
						{ status: 200 },
					),
			),
		);
		mockLocalFocusDetector();

		await expect(
			detectFocusRegions({
				inputFilePath,
				startSeconds: 1,
				endSeconds: 2,
				frameWidth: 1920,
				frameHeight: 1080,
				detectionMode: "people",
			}),
		).resolves.toMatchObject({
			fallback: false,
			detectorBackend: "yolo-cpu",
		});
		expect(execFileMock).toHaveBeenCalled();
	});

	it("falls back to local focus detection when Hailo returns invalid JSON", async () => {
		vi.stubEnv("CLIPSE_FOCUS_PROVIDER", "hailo-vision");
		const workspace = await mkdtemp(join(tmpdir(), "clipse-focus-test-"));
		const inputFilePath = join(workspace, "source.mp4");
		await writeFile(inputFilePath, Buffer.from("video"));
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(JSON.stringify({ detections: [] }))),
		);
		mockLocalFocusDetector();

		await expect(
			detectFocusRegions({
				inputFilePath,
				startSeconds: 1,
				endSeconds: 2,
				frameWidth: 1920,
				frameHeight: 1080,
				detectionMode: "screen",
			}),
		).resolves.toMatchObject({
			fallback: false,
			detectorBackend: "yolo-cpu",
		});
		expect(execFileMock).toHaveBeenCalled();
	});
});
