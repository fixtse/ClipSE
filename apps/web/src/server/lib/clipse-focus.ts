import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";

const execFileAsync = promisify(execFile);
const DEFAULT_HAILO_SERVICE_URL = "http://ai:8000";
const FOCUS_DEBUG_VALUES = new Set(["1", "true", "yes"]);

export interface FocusDetection {
	timestampSeconds: number;
	x: number;
	y: number;
	width: number;
	height: number;
	score: number;
	source:
		| "face"
		| "face-group"
		| "motion"
		| "person"
		| "person-group"
		| "product"
		| "product-group"
		| "screen-interest";
}

export type DetectorBackend =
	| "hailo-vision"
	| "opencv"
	| "rtdetr-cpu"
	| "rtdetr-cuda"
	| "rtdetr-openvino-intel-gpu"
	| "hailo-vlm"
	| "yolo-cpu"
	| "yolo-cuda"
	| "yolo-openvino-intel-gpu";

const hailoFocusResponseSchema = z.object({
	detections: z.array(
		z.object({
			timestampSeconds: z.number(),
			x: z.number(),
			y: z.number(),
			width: z.number(),
			height: z.number(),
			score: z.number(),
			source: z.enum([
				"face",
				"face-group",
				"motion",
				"person",
				"person-group",
				"product",
				"product-group",
				"screen-interest",
			]),
		}),
	),
	detectorBackend: z.enum(["hailo-vlm", "hailo-vision"]),
});

export interface FocusRegion {
	centerX: number;
	centerY: number;
	width: number | null;
	height: number | null;
	score: number;
	detectionCount: number;
}

export interface FocusPlan {
	regions: FocusRegion[];
	windows: FocusWindow[];
	fallback: boolean;
	detectorBackend: DetectorBackend;
}

export interface FocusWindow {
	startSeconds: number;
	endSeconds: number;
	regions: FocusRegion[];
}

interface ClusterAccumulator {
	centerX: number;
	centerY: number;
	left: number;
	top: number;
	right: number;
	bottom: number;
	score: number;
	detectionCount: number;
}

const MAX_FOCUS_REGIONS = 2;
const MIN_SECONDARY_SCORE_RATIO = 0.45;
const WINDOW_MERGE_DISTANCE_RATIO = 0.12;

function getDetectionCenter(detection: FocusDetection): {
	centerX: number;
	centerY: number;
} {
	return {
		centerX: detection.x + detection.width / 2,
		centerY: detection.y + detection.height / 2,
	};
}

export function buildFocusPlan(input: {
	detections: readonly FocusDetection[];
	frameWidth: number;
	frameHeight: number;
	detectorBackend?: DetectorBackend;
	clipStartSeconds?: number;
	clipEndSeconds?: number;
}): FocusPlan {
	const safeFrameWidth = Math.max(1, input.frameWidth);
	const safeFrameHeight = Math.max(1, input.frameHeight);
	const clipStartSeconds = input.clipStartSeconds ?? 0;
	const clipEndSeconds = Math.max(
		clipStartSeconds + 1,
		input.clipEndSeconds ?? clipStartSeconds + 1,
	);
	const usableDetections = input.detections.filter(
		(detection) =>
			detection.width > 0 &&
			detection.height > 0 &&
			detection.score > 0 &&
			Number.isFinite(detection.x) &&
			Number.isFinite(detection.y),
	);

	if (usableDetections.length === 0) {
		return {
			regions: [
				{
					centerX: safeFrameWidth / 2,
					centerY: safeFrameHeight / 2,
					width: null,
					height: null,
					score: 1,
					detectionCount: 0,
				},
			],
			windows: [
				{
					startSeconds: clipStartSeconds,
					endSeconds: clipEndSeconds,
					regions: [
						{
							centerX: safeFrameWidth / 2,
							centerY: safeFrameHeight / 2,
							width: null,
							height: null,
							score: 1,
							detectionCount: 0,
						},
					],
				},
			],
			fallback: true,
			detectorBackend: input.detectorBackend ?? "opencv",
		};
	}

	const windows = buildFocusWindows({
		detections: usableDetections,
		frameWidth: safeFrameWidth,
		frameHeight: safeFrameHeight,
		clipStartSeconds,
		clipEndSeconds,
	});

	const regionsFromWindows = windows.flatMap((window) =>
		window.regions.map((region) => ({
			timestampSeconds: window.startSeconds,
			x: region.centerX - (region.width ?? 1) / 2,
			y: region.centerY - (region.height ?? 1) / 2,
			width: region.width ?? 1,
			height: region.height ?? 1,
			score: region.score,
			source: "person-group" as const,
		})),
	);

	const regions = buildFocusRegions({
		detections: regionsFromWindows,
		frameWidth: safeFrameWidth,
		frameHeight: safeFrameHeight,
	});

	return {
		regions,
		windows,
		fallback: false,
		detectorBackend: input.detectorBackend ?? "opencv",
	};
}

function buildFocusRegions(input: {
	detections: readonly FocusDetection[];
	frameWidth: number;
	frameHeight: number;
}): FocusRegion[] {
	const sortedDetections = [...input.detections].sort(
		(left, right) => right.score - left.score,
	);
	const clusterDistanceThreshold = input.frameWidth * 0.22;
	const clusters: ClusterAccumulator[] = [];

	for (const detection of sortedDetections) {
		const center = getDetectionCenter(detection);
		const nearestCluster = clusters
			.map((cluster) => ({
				cluster,
				distance: Math.hypot(
					cluster.centerX - center.centerX,
					cluster.centerY - center.centerY,
				),
			}))
			.sort((left, right) => left.distance - right.distance)[0];

		if (nearestCluster && nearestCluster.distance <= clusterDistanceThreshold) {
			const totalScore = nearestCluster.cluster.score + detection.score;
			nearestCluster.cluster.centerX =
				(nearestCluster.cluster.centerX * nearestCluster.cluster.score +
					center.centerX * detection.score) /
				totalScore;
			nearestCluster.cluster.centerY =
				(nearestCluster.cluster.centerY * nearestCluster.cluster.score +
					center.centerY * detection.score) /
				totalScore;
			nearestCluster.cluster.left = Math.min(
				nearestCluster.cluster.left,
				detection.x,
			);
			nearestCluster.cluster.top = Math.min(
				nearestCluster.cluster.top,
				detection.y,
			);
			nearestCluster.cluster.right = Math.max(
				nearestCluster.cluster.right,
				detection.x + detection.width,
			);
			nearestCluster.cluster.bottom = Math.max(
				nearestCluster.cluster.bottom,
				detection.y + detection.height,
			);
			nearestCluster.cluster.score = totalScore;
			nearestCluster.cluster.detectionCount += 1;
			continue;
		}

		clusters.push({
			centerX: center.centerX,
			centerY: center.centerY,
			left: detection.x,
			top: detection.y,
			right: detection.x + detection.width,
			bottom: detection.y + detection.height,
			score: detection.score,
			detectionCount: 1,
		});
	}

	const sortedClusters = clusters.sort(
		(left, right) => right.score - left.score,
	);
	const primaryScore = sortedClusters[0]?.score ?? 0;
	return sortedClusters
		.filter(
			(cluster, index) =>
				index === 0 ||
				cluster.score >= primaryScore * MIN_SECONDARY_SCORE_RATIO,
		)
		.slice(0, MAX_FOCUS_REGIONS)
		.map((cluster) => ({
			centerX: Math.max(0, Math.min(input.frameWidth, cluster.centerX)),
			centerY: Math.max(0, Math.min(input.frameHeight, cluster.centerY)),
			width: Math.max(
				1,
				Math.min(input.frameWidth, cluster.right - cluster.left),
			),
			height: Math.max(
				1,
				Math.min(input.frameHeight, cluster.bottom - cluster.top),
			),
			score: cluster.score,
			detectionCount: cluster.detectionCount,
		}))
		.sort((left, right) => left.centerX - right.centerX);
}

function buildFocusWindows(input: {
	detections: readonly FocusDetection[];
	frameWidth: number;
	frameHeight: number;
	clipStartSeconds: number;
	clipEndSeconds: number;
}): FocusWindow[] {
	const detectionsByTimestamp = new Map<number, FocusDetection[]>();
	for (const detection of input.detections) {
		const timestamp = Number(detection.timestampSeconds.toFixed(3));
		detectionsByTimestamp.set(timestamp, [
			...(detectionsByTimestamp.get(timestamp) ?? []),
			detection,
		]);
	}

	const timestamps = [...detectionsByTimestamp.keys()].sort(
		(left, right) => left - right,
	);
	const sampledWindows = timestamps.flatMap((timestamp, index) => {
		const detections = detectionsByTimestamp.get(timestamp) ?? [];
		const regions = buildFocusRegions({
			detections,
			frameWidth: input.frameWidth,
			frameHeight: input.frameHeight,
		});
		const previousTimestamp = timestamps[index - 1];
		const nextTimestamp = timestamps[index + 1];
		const startSeconds =
			previousTimestamp === undefined
				? input.clipStartSeconds
				: Math.max(input.clipStartSeconds, (previousTimestamp + timestamp) / 2);
		const endSeconds =
			nextTimestamp === undefined
				? input.clipEndSeconds
				: Math.min(input.clipEndSeconds, (timestamp + nextTimestamp) / 2);

		return regions.length > 0 && endSeconds > startSeconds
			? [{ startSeconds, endSeconds, regions }]
			: [];
	});

	const mergedWindows: FocusWindow[] = [];
	for (const window of sampledWindows) {
		const previousWindow = mergedWindows.at(-1);
		if (
			previousWindow &&
			areCompatibleWindows(previousWindow, window, input.frameWidth)
		) {
			previousWindow.endSeconds = window.endSeconds;
			previousWindow.regions = mergeWindowRegions(
				previousWindow.regions,
				window.regions,
			);
			continue;
		}

		mergedWindows.push({
			startSeconds: window.startSeconds,
			endSeconds: window.endSeconds,
			regions: window.regions,
		});
	}

	return mergedWindows.length > 0
		? mergedWindows
		: [
				{
					startSeconds: input.clipStartSeconds,
					endSeconds: input.clipEndSeconds,
					regions: [
						{
							centerX: input.frameWidth / 2,
							centerY: input.frameHeight / 2,
							width: null,
							height: null,
							score: 1,
							detectionCount: 0,
						},
					],
				},
			];
}

function areCompatibleWindows(
	left: FocusWindow,
	right: FocusWindow,
	frameWidth: number,
): boolean {
	if (left.regions.length !== right.regions.length) {
		return false;
	}

	return left.regions.every((leftRegion, index) => {
		const rightRegion = right.regions[index];
		return rightRegion
			? Math.abs(leftRegion.centerX - rightRegion.centerX) <=
					frameWidth * WINDOW_MERGE_DISTANCE_RATIO
			: false;
	});
}

function mergeWindowRegions(
	left: readonly FocusRegion[],
	right: readonly FocusRegion[],
): FocusRegion[] {
	return left.map((leftRegion, index) => {
		const rightRegion = right[index];
		if (!rightRegion) {
			return leftRegion;
		}
		const totalCount = leftRegion.detectionCount + rightRegion.detectionCount;

		return {
			centerX:
				(leftRegion.centerX * leftRegion.detectionCount +
					rightRegion.centerX * rightRegion.detectionCount) /
				totalCount,
			centerY:
				(leftRegion.centerY * leftRegion.detectionCount +
					rightRegion.centerY * rightRegion.detectionCount) /
				totalCount,
			width:
				leftRegion.width && rightRegion.width
					? Math.max(leftRegion.width, rightRegion.width)
					: (leftRegion.width ?? rightRegion.width),
			height:
				leftRegion.height && rightRegion.height
					? Math.max(leftRegion.height, rightRegion.height)
					: (leftRegion.height ?? rightRegion.height),
			score: leftRegion.score + rightRegion.score,
			detectionCount: totalCount,
		};
	});
}

export async function detectFocusRegions(input: {
	inputFilePath: string;
	startSeconds: number;
	endSeconds: number;
	frameWidth: number;
	frameHeight: number;
	detectionMode?: "people" | "people_strict" | "product" | "screen";
}): Promise<FocusPlan> {
	const focusProvider = readFocusProvider();
	if (focusProvider === "hailo-vlm" || focusProvider === "hailo-vision") {
		logFocusDebug(
			`Attempting Hailo focus detection: provider=${focusProvider} mode=${input.detectionMode ?? "people"} start=${input.startSeconds.toFixed(3)} end=${input.endSeconds.toFixed(3)}`,
		);
		const hailoPlan = await detectHailoVlmFocusRegions({
			...input,
			provider: focusProvider,
		});
		if (hailoPlan && !hailoPlan.fallback) {
			logFocusDebug(
				`Using Hailo focus detection: backend=${hailoPlan.detectorBackend} regions=${hailoPlan.regions.length}`,
			);
			return hailoPlan;
		}
		logFocusDebug(
			"Hailo focus detection returned no usable plan; falling back to local detector",
		);
	}

	const scriptPath = join(
		process.cwd(),
		"apps/worker/scripts/detect-video-focus.py",
	);

	try {
		const { stderr, stdout } = await execFileAsync(
			"python3",
			[
				scriptPath,
				input.inputFilePath,
				input.startSeconds.toFixed(3),
				input.endSeconds.toFixed(3),
				input.detectionMode ?? "people",
			],
			{ maxBuffer: 1024 * 1024 * 5 },
		);
		const stdoutLines = stdout.trim().split(/\r?\n/);
		const jsonLine = [...stdoutLines]
			.reverse()
			.find((line: string) => line.trim().startsWith("{"));
		if (!jsonLine) {
			throw new Error("Focus detector did not return JSON");
		}
		const parsed = JSON.parse(jsonLine) as {
			detections?: FocusDetection[];
			detectorBackend?: DetectorBackend;
		};
		if (stderr) {
			console.info(stderr.trim());
		}
		const localPlan = buildFocusPlan({
			detections: parsed.detections ?? [],
			frameWidth: input.frameWidth,
			frameHeight: input.frameHeight,
			clipStartSeconds: input.startSeconds,
			clipEndSeconds: input.endSeconds,
			detectorBackend:
				parsed.detectorBackend === "yolo-cuda" ||
				parsed.detectorBackend === "yolo-cpu" ||
				parsed.detectorBackend === "yolo-openvino-intel-gpu" ||
				parsed.detectorBackend === "rtdetr-cuda" ||
				parsed.detectorBackend === "rtdetr-cpu" ||
				parsed.detectorBackend === "rtdetr-openvino-intel-gpu" ||
				parsed.detectorBackend === "hailo-vision" ||
				parsed.detectorBackend === "hailo-vlm"
					? parsed.detectorBackend
					: "opencv",
		});
		logFocusDebug(
			`Using local focus detection: backend=${localPlan.detectorBackend} fallback=${localPlan.fallback} regions=${localPlan.regions.length}`,
		);
		return localPlan;
	} catch (error) {
		console.warn("Focus detection failed; using centered crop:", error);
		return buildFocusPlan({
			detections: [],
			frameWidth: input.frameWidth,
			frameHeight: input.frameHeight,
			clipStartSeconds: input.startSeconds,
			clipEndSeconds: input.endSeconds,
			detectorBackend: "opencv",
		});
	}
}

async function detectHailoVlmFocusRegions(input: {
	inputFilePath: string;
	startSeconds: number;
	endSeconds: number;
	frameWidth: number;
	frameHeight: number;
	detectionMode?: "people" | "people_strict" | "product" | "screen";
	provider: "hailo-vlm" | "hailo-vision";
}): Promise<FocusPlan | null> {
	try {
		const formData = new FormData();
		const fileBuffer = await readFile(input.inputFilePath);
		formData.set(
			"file",
			new File([fileBuffer], "clip-source.mp4", {
				type: "video/mp4",
			}),
		);
		formData.set("start_seconds", input.startSeconds.toFixed(3));
		formData.set("end_seconds", input.endSeconds.toFixed(3));
		formData.set("detection_mode", input.detectionMode ?? "people");
		formData.set("detector_backend", input.provider);

		const response = await fetch(`${readHailoServiceUrl()}/focus-detections`, {
			method: "POST",
			body: formData,
		});
		if (!response.ok) {
			console.warn(
				`Hailo focus detection failed with ${response.status}: ${await response.text()}`,
			);
			return null;
		}

		const parsed = hailoFocusResponseSchema.parse(await response.json());
		if (parsed.detections.length === 0) {
			logFocusDebug(
				`Hailo focus detection produced zero detections: provider=${input.provider}`,
			);
			return null;
		}
		return buildFocusPlan({
			detections: parsed.detections,
			frameWidth: input.frameWidth,
			frameHeight: input.frameHeight,
			clipStartSeconds: input.startSeconds,
			clipEndSeconds: input.endSeconds,
			detectorBackend: parsed.detectorBackend,
		});
	} catch (error) {
		console.warn("Hailo focus detection failed; falling back:", error);
		return null;
	}
}

function readFocusProvider(): "auto" | "local" | "hailo-vlm" | "hailo-vision" {
	const provider = process.env.CLIPSE_FOCUS_PROVIDER;
	return provider === "hailo-vlm" ||
		provider === "hailo-vision" ||
		provider === "local"
		? provider
		: "auto";
}

function readHailoServiceUrl(): string {
	return process.env.CLIPSE_HAILO_SERVICE_URL || DEFAULT_HAILO_SERVICE_URL;
}

function logFocusDebug(message: string): void {
	if (
		FOCUS_DEBUG_VALUES.has(
			(
				process.env.CLIPSE_FOCUS_DEBUG ||
				process.env.WHISPER_DEBUG ||
				""
			).toLowerCase(),
		)
	) {
		console.info(`[focus] ${message}`);
	}
}
