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
	source: "face" | "motion";
}

export interface FocusRegion {
	centerX: number;
	centerY: number;
	score: number;
	detectionCount: number;
}

export interface FocusPlan {
	regions: FocusRegion[];
	fallback: boolean;
}

interface ClusterAccumulator {
	centerX: number;
	centerY: number;
	score: number;
	detectionCount: number;
}

const MAX_FOCUS_REGIONS = 2;
const MIN_SECONDARY_SCORE_RATIO = 0.45;

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
}): FocusPlan {
	const safeFrameWidth = Math.max(1, input.frameWidth);
	const safeFrameHeight = Math.max(1, input.frameHeight);
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
					score: 1,
					detectionCount: 0,
				},
			],
			fallback: true,
		};
	}

	const sortedDetections = [...usableDetections].sort(
		(left, right) => right.score - left.score,
	);
	const clusterDistanceThreshold = safeFrameWidth * 0.22;
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
			nearestCluster.cluster.score = totalScore;
			nearestCluster.cluster.detectionCount += 1;
			continue;
		}

		clusters.push({
			centerX: center.centerX,
			centerY: center.centerY,
			score: detection.score,
			detectionCount: 1,
		});
	}

	const sortedClusters = clusters.sort(
		(left, right) => right.score - left.score,
	);
	const primaryScore = sortedClusters[0]?.score ?? 0;
	const regions = sortedClusters
		.filter(
			(cluster, index) =>
				index === 0 ||
				cluster.score >= primaryScore * MIN_SECONDARY_SCORE_RATIO,
		)
		.slice(0, MAX_FOCUS_REGIONS)
		.map((cluster) => ({
			centerX: Math.max(0, Math.min(safeFrameWidth, cluster.centerX)),
			centerY: Math.max(0, Math.min(safeFrameHeight, cluster.centerY)),
			score: cluster.score,
			detectionCount: cluster.detectionCount,
		}));

	return {
		regions,
		fallback: false,
	};
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
		const parsed = JSON.parse(stdout) as { detections?: FocusDetection[] };
		return buildFocusPlan({
			detections: parsed.detections ?? [],
			frameWidth: input.frameWidth,
			frameHeight: input.frameHeight,
		});
	} catch (error) {
		console.warn("Focus detection failed; using centered crop:", error);
		return buildFocusPlan({
			detections: [],
			frameWidth: input.frameWidth,
			frameHeight: input.frameHeight,
		});
	}
}
