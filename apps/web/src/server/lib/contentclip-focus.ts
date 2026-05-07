import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface FocusDetection {
	timestampSeconds: number;
	x: number;
	y: number;
	width: number;
	height: number;
	score: number;
	source: "face" | "face-group" | "motion" | "person" | "person-group";
}

export type DetectorBackend = "opencv" | "yolo-cuda";

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
const WINDOW_MERGE_DISTANCE_RATIO = 0.18;
const WINDOW_HYSTERESIS_DISTANCE_RATIO = 0.28;
const MIN_LAYOUT_CHANGE_SECONDS = 2.05;

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

	const stableWindows = suppressTransientWindows({
		windows: sampledWindows,
		frameWidth: input.frameWidth,
	});

	const mergedWindows: FocusWindow[] = [];
	for (const window of stableWindows) {
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

function getWindowDuration(window: FocusWindow): number {
	return Math.max(0, window.endSeconds - window.startSeconds);
}

function suppressTransientWindows(input: {
	windows: readonly FocusWindow[];
	frameWidth: number;
}): FocusWindow[] {
	const windows = input.windows.map((window) => ({
		startSeconds: window.startSeconds,
		endSeconds: window.endSeconds,
		regions: window.regions,
	}));

	if (windows.length <= 2) {
		return windows;
	}

	const stabilized: FocusWindow[] = [];
	for (let index = 0; index < windows.length; index += 1) {
		const window = windows[index];
		if (!window) {
			continue;
		}

		const previousWindow = stabilized.at(-1);
		const nextWindow = windows[index + 1];
		const isInteriorWindow = Boolean(previousWindow && nextWindow);
		const isBrief = getWindowDuration(window) < MIN_LAYOUT_CHANGE_SECONDS;
		const returnsToPreviousLayout =
			previousWindow &&
			nextWindow &&
			areSimilarWindows(previousWindow, nextWindow, input.frameWidth);

		if (isInteriorWindow && isBrief && returnsToPreviousLayout) {
			previousWindow.endSeconds = window.endSeconds;
			continue;
		}

		if (
			previousWindow &&
			areSimilarWindows(previousWindow, window, input.frameWidth)
		) {
			previousWindow.endSeconds = window.endSeconds;
			previousWindow.regions = mergeWindowRegions(
				previousWindow.regions,
				window.regions,
			);
			continue;
		}

		stabilized.push(window);
	}

	return stabilized;
}

function areCompatibleWindows(
	left: FocusWindow,
	right: FocusWindow,
	frameWidth: number,
): boolean {
	return areWindowsWithinDistance(
		left,
		right,
		frameWidth,
		WINDOW_MERGE_DISTANCE_RATIO,
	);
}

function areSimilarWindows(
	left: FocusWindow,
	right: FocusWindow,
	frameWidth: number,
): boolean {
	return areWindowsWithinDistance(
		left,
		right,
		frameWidth,
		WINDOW_HYSTERESIS_DISTANCE_RATIO,
	);
}

function areWindowsWithinDistance(
	left: FocusWindow,
	right: FocusWindow,
	frameWidth: number,
	distanceRatio: number,
): boolean {
	if (left.regions.length !== right.regions.length) {
		return false;
	}

	return left.regions.every((leftRegion, index) => {
		const rightRegion = right.regions[index];
		return rightRegion
			? Math.abs(leftRegion.centerX - rightRegion.centerX) <=
					frameWidth * distanceRatio
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
}): Promise<FocusPlan> {
	const scriptPath = join(
		process.cwd(),
		"apps/worker/scripts/detect-video-focus.py",
	);

	try {
		const { stdout } = await execFileAsync(
			"python3",
			[
				scriptPath,
				input.inputFilePath,
				input.startSeconds.toFixed(3),
				input.endSeconds.toFixed(3),
			],
			{ maxBuffer: 1024 * 1024 * 5 },
		);
		const parsed = JSON.parse(stdout) as {
			detections?: FocusDetection[];
			detectorBackend?: DetectorBackend;
		};
		return buildFocusPlan({
			detections: parsed.detections ?? [],
			frameWidth: input.frameWidth,
			frameHeight: input.frameHeight,
			clipStartSeconds: input.startSeconds,
			clipEndSeconds: input.endSeconds,
			detectorBackend:
				parsed.detectorBackend === "yolo-cuda" ? "yolo-cuda" : "opencv",
		});
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
