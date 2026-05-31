import { execFile, spawn } from "node:child_process";
import {
	mkdir,
	open,
	readdir,
	readFile,
	stat,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import {
	detectFocusRegions,
	type FocusPlan,
	type FocusRegion,
	type FocusWindow,
} from "~/server/lib/clipse-focus";
import type { RenderSubtitleCue } from "~/server/lib/clipse-subtitles";

const execFileAsync = promisify(execFile);

export interface CaptionStyle {
	readonly color: string;
	readonly highlightColor: string;
	readonly fontFamily: string;
}

const DEFAULT_CAPTION_STYLE: CaptionStyle = {
	color: "#ffffff",
	highlightColor: "#ffe45c",
	fontFamily: "Arial",
};
const SYSTEM_CAPTION_FONTS = new Set([
	"Arial",
	"Helvetica",
	"Impact",
	"Verdana",
	"Georgia",
	"Times New Roman",
	"Courier New",
]);
const GOOGLE_FONT_REGISTRATION_PROMISES = new Map<string, Promise<void>>();

async function runBinary(command: string, args: string[]): Promise<string> {
	const { stdout, stderr } = await execFileAsync(command, args, {
		maxBuffer: 1024 * 1024 * 20,
	});

	if (stderr) {
		console.info(`[${command}] ${stderr}`);
	}

	return stdout.trim();
}

function parseFfmpegTimestamp(value: string): number | null {
	const parts = value.split(":");
	if (parts.length !== 3) {
		return null;
	}

	const [hoursText, minutesText, secondsText] = parts;
	const hours = Number.parseFloat(hoursText ?? "");
	const minutes = Number.parseFloat(minutesText ?? "");
	const seconds = Number.parseFloat(secondsText ?? "");

	if (
		!Number.isFinite(hours) ||
		!Number.isFinite(minutes) ||
		!Number.isFinite(seconds)
	) {
		return null;
	}

	return hours * 3600 + minutes * 60 + seconds;
}

export function parseFfmpegProgressSeconds(line: string): number | null {
	const [key, value] = line.trim().split("=");
	if (!key || !value) {
		return null;
	}

	if (key === "out_time_us" || key === "out_time_ms") {
		const microseconds = Number.parseInt(value, 10);
		return Number.isFinite(microseconds) ? microseconds / 1_000_000 : null;
	}

	if (key === "out_time") {
		return parseFfmpegTimestamp(value);
	}

	return null;
}

async function runFfmpeg(
	args: string[],
	input?: {
		durationSeconds?: number;
		onProgress?: (progress: number) => Promise<void>;
	},
): Promise<void> {
	if (
		!input?.onProgress ||
		!input.durationSeconds ||
		input.durationSeconds <= 0
	) {
		await runBinary("ffmpeg", args);
		return;
	}

	const durationSeconds = input.durationSeconds;
	await new Promise<void>((resolve, reject) => {
		const ffmpeg = spawn("ffmpeg", [
			...args.slice(0, -1),
			"-progress",
			"pipe:2",
			"-nostats",
			...(args.at(-1) ? [args.at(-1) as string] : []),
		]);
		let stderr = "";
		let progressBuffer = "";
		let pendingProgress = Promise.resolve();

		ffmpeg.stdout.on("data", () => {
			// Drain stdout so a verbose child process cannot block on a full pipe.
		});
		ffmpeg.stderr.on("data", (chunk: Buffer) => {
			const text = chunk.toString("utf8");
			stderr += text;
			progressBuffer += text;
			const lines = progressBuffer.split(/\r?\n/);
			progressBuffer = lines.pop() ?? "";

			for (const line of lines) {
				const seconds = parseFfmpegProgressSeconds(line);
				if (seconds === null) {
					continue;
				}

				const progress = Math.min(
					99,
					Math.max(0, Math.floor((seconds / durationSeconds) * 100)),
				);
				pendingProgress = pendingProgress
					.then(() => input.onProgress?.(progress))
					.then(() => undefined)
					.catch((error: unknown) => {
						console.warn("Failed to update ffmpeg progress:", error);
					});
			}
		});

		ffmpeg.on("error", reject);
		ffmpeg.on("close", (code) => {
			pendingProgress
				.then(() => {
					if (code === 0) {
						resolve();
						return;
					}

					reject(
						new Error(
							`ffmpeg exited with code ${code ?? "unknown"}: ${stderr.trim()}`,
						),
					);
				})
				.catch(reject);
		});
	});
}

function getYtDlpBaseArgs(): string[] {
	const cookiesFile = process.env.CLIPSE_YTDLP_COOKIES_FILE?.trim();
	const userAgent = process.env.CLIPSE_YTDLP_USER_AGENT?.trim();
	const baseArgs = [
		"--no-playlist",
		"--newline",
		"--retries",
		"10",
		"--fragment-retries",
		"10",
		"--retry-sleep",
		"linear=1::5",
		"--extractor-args",
		"youtube:player_client=android,web",
	];

	const authArgs = [
		...(cookiesFile ? ["--cookies", cookiesFile] : []),
		...(userAgent ? ["--user-agent", userAgent] : []),
	];

	return [...baseArgs, ...authArgs];
}

function getYtDlpArgs(sourceUrl: string, outputDirectory?: string): string[] {
	if (!outputDirectory) {
		return [...getYtDlpBaseArgs(), "--dump-json", "--skip-download", sourceUrl];
	}

	return [
		...getYtDlpBaseArgs(),
		"--progress-template",
		"download:%(progress._percent_str)s",
		"--merge-output-format",
		"mp4",
		"--remux-video",
		"mp4",
		"-f",
		"bv*+ba/b",
		"-o",
		join(outputDirectory, "source.%(ext)s"),
		sourceUrl,
	];
}

async function runFfmpegWithFallback(input: {
	nvidiaArgs: string[];
	cpuArgs: string[];
	durationSeconds?: number;
	onProgress?: (progress: number) => Promise<void>;
}): Promise<void> {
	try {
		await runFfmpeg(input.nvidiaArgs, input);
	} catch (error) {
		console.warn("NVIDIA ffmpeg path failed, falling back to CPU:", error);
		await runFfmpeg(input.cpuArgs, input);
	}
}

function getNvencOutputArgs(): string[] {
	return [
		"-c:v",
		"h264_nvenc",
		"-profile:v",
		"high",
		"-preset",
		"p4",
		"-tune",
		"hq",
		"-rc",
		"vbr",
		"-cq",
		"22",
		"-b:v",
		"0",
		"-pix_fmt",
		"yuv420p",
	];
}

function getX264OutputArgs(): string[] {
	return [
		"-c:v",
		"libx264",
		"-preset",
		"veryfast",
		"-crf",
		"22",
		"-pix_fmt",
		"yuv420p",
	];
}

function parseFrameRate(value: string | undefined): number | null {
	if (!value || value === "0/0") {
		return null;
	}

	const [numeratorText, denominatorText] = value.split("/");
	const numerator = Number.parseFloat(numeratorText ?? "");
	const denominator = Number.parseFloat(denominatorText ?? "");

	if (
		!Number.isFinite(numerator) ||
		!Number.isFinite(denominator) ||
		denominator <= 0
	) {
		return null;
	}

	const frameRate = numerator / denominator;
	return Number.isFinite(frameRate) && frameRate > 0
		? Number(frameRate.toFixed(3))
		: null;
}

export interface MediaMetadata {
	durationSeconds: number;
	frameRate: number | null;
	hasAudio: boolean;
	width: number | null;
	height: number | null;
}

const INTERNAL_TRANSITION_SECONDS = 0.35;
const DEFAULT_CAPTION_Y_RATIO = 0.73;
const STACKED_VERTICAL_CAPTION_Y_RATIO = 0.5;

export function getVerticalCaptionYRatio(input: {
	hasStackedLayout: boolean;
}): number {
	return input.hasStackedLayout
		? STACKED_VERTICAL_CAPTION_Y_RATIO
		: DEFAULT_CAPTION_Y_RATIO;
}

export async function getMediaMetadata(
	filePath: string,
): Promise<MediaMetadata> {
	const stdout = await runBinary("ffprobe", [
		"-v",
		"error",
		"-print_format",
		"json",
		"-show_entries",
		"format=duration:stream=codec_type,avg_frame_rate,width,height",
		filePath,
	]);

	const parsed = JSON.parse(stdout) as {
		format?: { duration?: string };
		streams?: Array<{
			codec_type?: string;
			avg_frame_rate?: string;
			width?: number;
			height?: number;
		}>;
	};

	const duration = Number.parseFloat(parsed.format?.duration ?? "");
	if (!Number.isFinite(duration) || duration <= 0) {
		throw new Error("Failed to read media duration");
	}

	const videoStream = parsed.streams?.find(
		(stream) => stream.codec_type === "video",
	);
	const audioStream = parsed.streams?.find(
		(stream) => stream.codec_type === "audio",
	);

	return {
		durationSeconds: duration,
		frameRate: parseFrameRate(videoStream?.avg_frame_rate),
		hasAudio: Boolean(audioStream),
		width: videoStream?.width ?? null,
		height: videoStream?.height ?? null,
	};
}

export async function extractWhisperAudio(
	inputFilePath: string,
	outputFilePath: string,
): Promise<void> {
	await runBinary("ffmpeg", [
		"-y",
		"-i",
		inputFilePath,
		"-vn",
		"-ac",
		"1",
		"-ar",
		"16000",
		"-c:a",
		"pcm_s16le",
		outputFilePath,
	]);
}

export async function renderClipSegment(input: {
	inputFilePath: string;
	outputFilePath: string;
	startSeconds: number;
	endSeconds: number;
	introFilePath?: string | null;
	outroFilePath?: string | null;
	aspectMode?: "source" | "vertical9x16";
	shortDetectionMode?:
		| "people"
		| "people_and_screen"
		| "product_view"
		| "screen_only";
	subtitleFilePath?: string | null;
	captionStyle?: CaptionStyle;
	onProgress?: (progress: number) => Promise<void>;
}): Promise<void> {
	const durationSeconds = Math.max(1, input.endSeconds - input.startSeconds);
	const workspace = dirname(input.outputFilePath);
	const aspectMode = input.aspectMode ?? "source";
	let reportedProgress = 0;
	const reportProgress = async (progress: number): Promise<void> => {
		const nextProgress = Math.max(
			reportedProgress,
			Math.min(100, Math.floor(progress)),
		);
		if (nextProgress === reportedProgress) {
			return;
		}

		reportedProgress = nextProgress;
		await input.onProgress?.(nextProgress);
	};
	const segmentOutputPath =
		input.introFilePath || input.outroFilePath
			? join(workspace, "clip-segment.mp4")
			: input.outputFilePath;

	if (aspectMode === "vertical9x16") {
		const metadata = await getMediaMetadata(input.inputFilePath);
		const frameWidth = metadata.width ?? 1920;
		const frameHeight = metadata.height ?? 1080;
		const focusPlan = await detectFocusRegions({
			inputFilePath: input.inputFilePath,
			startSeconds: input.startSeconds,
			endSeconds: input.endSeconds,
			frameWidth,
			frameHeight,
			detectionMode:
				input.shortDetectionMode === "screen_only"
					? "screen"
					: input.shortDetectionMode === "product_view"
						? "product"
						: input.shortDetectionMode === "people_and_screen"
							? "people_strict"
							: "people",
		});

		await renderVerticalClipSegment({
			inputFilePath: input.inputFilePath,
			outputFilePath: segmentOutputPath,
			startSeconds: input.startSeconds,
			durationSeconds,
			frameWidth,
			frameHeight,
			focusPlan,
			shortDetectionMode: input.shortDetectionMode,
			subtitleFilePath: input.subtitleFilePath,
			captionStyle: input.captionStyle,
			onProgress: async (progress) => reportProgress(progress * 0.72),
		});
	} else if (input.subtitleFilePath) {
		await renderSourceClipSegmentWithSubtitles({
			inputFilePath: input.inputFilePath,
			outputFilePath: segmentOutputPath,
			startSeconds: input.startSeconds,
			durationSeconds,
			subtitleFilePath: input.subtitleFilePath,
			captionStyle: input.captionStyle,
			onProgress: async (progress) => reportProgress(progress * 0.72),
		});
	} else {
		const baseArgs = [
			"-y",
			"-ss",
			input.startSeconds.toFixed(3),
			"-i",
			input.inputFilePath,
			"-t",
			durationSeconds.toFixed(3),
		] as const;

		await runFfmpegWithFallback({
			nvidiaArgs: [
				"-y",
				"-hwaccel",
				"cuda",
				"-hwaccel_output_format",
				"cuda",
				"-ss",
				input.startSeconds.toFixed(3),
				"-i",
				input.inputFilePath,
				"-t",
				durationSeconds.toFixed(3),
				"-c:v",
				"h264_nvenc",
				"-profile:v",
				"high",
				"-preset",
				"p4",
				"-tune",
				"hq",
				"-rc",
				"vbr",
				"-cq",
				"22",
				"-b:v",
				"0",
				"-pix_fmt",
				"yuv420p",
				"-c:a",
				"copy",
				"-movflags",
				"+faststart",
				segmentOutputPath,
			],
			cpuArgs: [
				...baseArgs,
				"-c:v",
				"libx264",
				"-preset",
				"veryfast",
				"-crf",
				"22",
				"-c:a",
				"aac",
				"-movflags",
				"+faststart",
				segmentOutputPath,
			],
			durationSeconds,
			onProgress: async (progress) => reportProgress(progress * 0.72),
		});
	}
	await reportProgress(72);

	const concatInputs = [
		input.introFilePath,
		segmentOutputPath,
		input.outroFilePath,
	].filter(Boolean) as string[];

	if (concatInputs.length <= 1) {
		await reportProgress(100);
		return;
	}

	const normalizedPaths = await Promise.all(
		concatInputs.map(async (filePath, index) => {
			const normalizedPath = join(workspace, `concat-${index}.mp4`);
			await normalizeVideoForConcat({
				inputFilePath: filePath,
				outputFilePath: normalizedPath,
				aspectMode,
			});
			await reportProgress(72 + ((index + 1) / concatInputs.length) * 12);
			return normalizedPath;
		}),
	);
	const transitionedPaths = await Promise.all(
		normalizedPaths.map(async (filePath, index) => {
			const fadeIn = index > 0;
			const fadeOut = index < normalizedPaths.length - 1;
			if (!fadeIn && !fadeOut) {
				return filePath;
			}

			const transitionedPath = join(
				workspace,
				`concat-transition-${index}.mp4`,
			);
			await applyInternalEdgeFades({
				inputFilePath: filePath,
				outputFilePath: transitionedPath,
				fadeIn,
				fadeOut,
			});
			await reportProgress(84 + ((index + 1) / normalizedPaths.length) * 8);
			return transitionedPath;
		}),
	);
	const concatListPath = join(workspace, "concat-list.txt");
	await writeFile(
		concatListPath,
		transitionedPaths
			.map((filePath) => `file '${filePath.replaceAll("'", "'\\''")}'`)
			.join("\n"),
		"utf8",
	);

	await runFfmpeg(
		[
			"-y",
			"-f",
			"concat",
			"-safe",
			"0",
			"-i",
			concatListPath,
			"-c",
			"copy",
			"-movflags",
			"+faststart",
			input.outputFilePath,
		],
		{
			durationSeconds:
				durationSeconds +
				(input.introFilePath ? INTERNAL_TRANSITION_SECONDS : 0) +
				(input.outroFilePath ? INTERNAL_TRANSITION_SECONDS : 0),
			onProgress: async (progress) => reportProgress(92 + progress * 0.08),
		},
	);
	await reportProgress(100);
}

function getCrop(input: {
	frameWidth: number;
	frameHeight: number;
	centerX: number;
	centerY: number;
	targetAspectRatio: number;
	focusWidth?: number | null;
	focusHeight?: number | null;
}): { x: number; y: number; width: number; height: number } {
	const frameAspectRatio = input.frameWidth / input.frameHeight;
	const minimumCropWidth =
		input.focusWidth && input.focusHeight
			? Math.max(
					input.focusWidth * 1.22,
					input.focusHeight * input.targetAspectRatio * 1.12,
				)
			: 0;
	const maximumCropWidth =
		frameAspectRatio > input.targetAspectRatio
			? input.frameHeight * input.targetAspectRatio
			: input.frameWidth;
	const cropWidth = Math.min(
		maximumCropWidth,
		Math.max(maximumCropWidth * 0.48, minimumCropWidth),
	);
	const cropHeight = cropWidth / input.targetAspectRatio;
	const x = Math.max(
		0,
		Math.min(input.frameWidth - cropWidth, input.centerX - cropWidth / 2),
	);
	const y = Math.max(
		0,
		Math.min(input.frameHeight - cropHeight, input.centerY - cropHeight / 2),
	);

	return {
		x: Math.round(x / 2) * 2,
		y: Math.round(y / 2) * 2,
		width: Math.max(2, Math.round(cropWidth / 2) * 2),
		height: Math.max(2, Math.round(cropHeight / 2) * 2),
	};
}

function getOverlapArea(
	left: { x: number; y: number; width: number; height: number },
	right: { x: number; y: number; width: number; height: number },
): number {
	const overlapWidth = Math.max(
		0,
		Math.min(left.x + left.width, right.x + right.width) -
			Math.max(left.x, right.x),
	);
	const overlapHeight = Math.max(
		0,
		Math.min(left.y + left.height, right.y + right.height) -
			Math.max(left.y, right.y),
	);

	return overlapWidth * overlapHeight;
}

function getScreenCropAvoidingFocus(input: {
	frameWidth: number;
	frameHeight: number;
	targetAspectRatio: number;
	focusRegion?: FocusRegion | null;
}): { x: number; y: number; width: number; height: number } {
	const frameAspectRatio = input.frameWidth / input.frameHeight;
	const cropWidth =
		frameAspectRatio > input.targetAspectRatio
			? input.frameHeight * input.targetAspectRatio
			: input.frameWidth;
	const cropHeight = cropWidth / input.targetAspectRatio;
	const maxX = Math.max(0, input.frameWidth - cropWidth);
	const maxY = Math.max(0, input.frameHeight - cropHeight);
	const centerX = maxX / 2;
	const centerY = maxY / 2;

	if (!input.focusRegion?.width || !input.focusRegion.height) {
		return {
			x: Math.round(centerX / 2) * 2,
			y: Math.round(centerY / 2) * 2,
			width: Math.max(2, Math.round(cropWidth / 2) * 2),
			height: Math.max(2, Math.round(cropHeight / 2) * 2),
		};
	}

	const focusPadding = Math.max(input.frameWidth, input.frameHeight) * 0.035;
	const focusBox = {
		x: Math.max(
			0,
			input.focusRegion.centerX - input.focusRegion.width / 2 - focusPadding,
		),
		y: Math.max(
			0,
			input.focusRegion.centerY - input.focusRegion.height / 2 - focusPadding,
		),
		width: Math.min(
			input.frameWidth,
			input.focusRegion.width + focusPadding * 2,
		),
		height: Math.min(
			input.frameHeight,
			input.focusRegion.height + focusPadding * 2,
		),
	};
	const clampX = (value: number) => Math.max(0, Math.min(maxX, value));
	const clampY = (value: number) => Math.max(0, Math.min(maxY, value));
	const candidateXs = [
		centerX,
		0,
		maxX,
		focusBox.x - cropWidth,
		focusBox.x + focusBox.width,
	].map(clampX);
	const candidateYs = [
		centerY,
		0,
		maxY,
		focusBox.y - cropHeight,
		focusBox.y + focusBox.height,
	].map(clampY);
	const candidates = candidateXs.flatMap((x) =>
		candidateYs.map((y) => ({
			x,
			y,
			width: cropWidth,
			height: cropHeight,
		})),
	);
	const bestCandidate = candidates
		.map((crop) => ({
			crop,
			overlapArea: getOverlapArea(crop, focusBox),
			centerDistance: Math.hypot(crop.x - centerX, crop.y - centerY),
		}))
		.sort(
			(left, right) =>
				left.overlapArea - right.overlapArea ||
				left.centerDistance - right.centerDistance,
		)[0]?.crop;

	return {
		x: Math.round((bestCandidate?.x ?? centerX) / 2) * 2,
		y: Math.round((bestCandidate?.y ?? centerY) / 2) * 2,
		width: Math.max(2, Math.round(cropWidth / 2) * 2),
		height: Math.max(2, Math.round(cropHeight / 2) * 2),
	};
}

function getScreenOnlyCrop(input: {
	frameWidth: number;
	frameHeight: number;
	targetAspectRatio: number;
	interestRegion?: FocusRegion | null;
}): { x: number; y: number; width: number; height: number } {
	const frameAspectRatio = input.frameWidth / input.frameHeight;
	const maximumCropWidth =
		frameAspectRatio > input.targetAspectRatio
			? input.frameHeight * input.targetAspectRatio
			: input.frameWidth;
	const minimumCropWidth = maximumCropWidth * 0.72;
	const interestWidth = input.interestRegion?.width
		? Math.max(input.interestRegion.width * 2.6, minimumCropWidth)
		: minimumCropWidth;
	const interestHeight = input.interestRegion?.height
		? input.interestRegion.height * input.targetAspectRatio * 2.1
		: minimumCropWidth;
	const cropWidth = Math.min(
		maximumCropWidth,
		Math.max(minimumCropWidth, interestWidth, interestHeight),
	);
	const cropHeight = cropWidth / input.targetAspectRatio;
	const centerX = input.interestRegion?.centerX ?? input.frameWidth / 2;
	const centerY = input.interestRegion?.centerY ?? input.frameHeight / 2;
	const x = Math.max(
		0,
		Math.min(input.frameWidth - cropWidth, centerX - cropWidth / 2),
	);
	const y = Math.max(
		0,
		Math.min(input.frameHeight - cropHeight, centerY - cropHeight / 2),
	);

	return {
		x: Math.round(x / 2) * 2,
		y: Math.round(y / 2) * 2,
		width: Math.max(2, Math.round(cropWidth / 2) * 2),
		height: Math.max(2, Math.round(cropHeight / 2) * 2),
	};
}

function getScreenOnlyCropWithSize(input: {
	frameWidth: number;
	frameHeight: number;
	width: number;
	height: number;
	interestRegion?: FocusRegion | null;
}): { x: number; y: number; width: number; height: number } {
	const centerX = input.interestRegion?.centerX ?? input.frameWidth / 2;
	const centerY = input.interestRegion?.centerY ?? input.frameHeight / 2;
	const x = Math.max(
		0,
		Math.min(input.frameWidth - input.width, centerX - input.width / 2),
	);
	const y = Math.max(
		0,
		Math.min(input.frameHeight - input.height, centerY - input.height / 2),
	);

	return {
		x: Math.round(x / 2) * 2,
		y: Math.round(y / 2) * 2,
		width: input.width,
		height: input.height,
	};
}

function buildSmoothStepExpression(input: {
	from: number;
	to: number;
	transitionStartSeconds: number;
	transitionDurationSeconds: number;
}): string {
	const duration = Math.max(0.001, input.transitionDurationSeconds);
	const progress = `(t-${input.transitionStartSeconds.toFixed(3)})/${duration.toFixed(3)}`;
	const smoothProgress = `(${progress})*(${progress})*(3-2*(${progress}))`;

	return `(${input.from}+(${input.to - input.from})*(${smoothProgress}))`;
}

function buildAnimatedCropCoordinateExpression(
	keyframes: readonly { atSeconds: number; value: number }[],
): string {
	const [firstKeyframe, ...remainingKeyframes] = keyframes;
	if (!firstKeyframe || remainingKeyframes.length === 0) {
		return `${Math.round((firstKeyframe?.value ?? 0) / 2) * 2}`;
	}

	return remainingKeyframes.reduceRight(
		(expression, keyframe, index) => {
			const previousKeyframe = keyframes[index];
			if (!previousKeyframe) {
				return expression;
			}
			const transitionDurationSeconds = Math.min(
				3,
				Math.max(1.4, (keyframe.atSeconds - previousKeyframe.atSeconds) * 0.75),
			);
			const transitionStartSeconds = Math.max(
				previousKeyframe.atSeconds,
				keyframe.atSeconds - transitionDurationSeconds,
			);
			const interpolated = buildSmoothStepExpression({
				from: previousKeyframe.value,
				to: keyframe.value,
				transitionStartSeconds,
				transitionDurationSeconds,
			});

			return `if(lt(t\\,${keyframe.atSeconds.toFixed(3)})\\,${interpolated}\\,${expression})`;
		},
		`${Math.round(remainingKeyframes.at(-1)?.value ?? firstKeyframe.value)}`,
	);
}

function getCropDistance(
	left: { x: number; y: number },
	right: { x: number; y: number },
): number {
	return Math.hypot(left.x - right.x, left.y - right.y);
}

function dampCropTowardAnchor(input: {
	anchorCrop: { x: number; y: number; width: number; height: number };
	targetCrop: { x: number; y: number; width: number; height: number };
	frameWidth: number;
	frameHeight: number;
}): { x: number; y: number; width: number; height: number } {
	const pullRatio = 0.55;
	const maxShiftX = input.anchorCrop.width * 0.28;
	const maxShiftY = input.anchorCrop.height * 0.2;
	const requestedX = (input.targetCrop.x - input.anchorCrop.x) * pullRatio;
	const requestedY = (input.targetCrop.y - input.anchorCrop.y) * pullRatio;
	const x = Math.max(
		0,
		Math.min(
			input.frameWidth - input.anchorCrop.width,
			input.anchorCrop.x +
				Math.max(-maxShiftX, Math.min(maxShiftX, requestedX)),
		),
	);
	const y = Math.max(
		0,
		Math.min(
			input.frameHeight - input.anchorCrop.height,
			input.anchorCrop.y +
				Math.max(-maxShiftY, Math.min(maxShiftY, requestedY)),
		),
	);

	return {
		x: Math.round(x / 2) * 2,
		y: Math.round(y / 2) * 2,
		width: input.anchorCrop.width,
		height: input.anchorCrop.height,
	};
}

function compactCropKeyframes(
	keyframes: readonly { atSeconds: number; x: number; y: number }[],
): { atSeconds: number; x: number; y: number }[] {
	const compacted: { atSeconds: number; x: number; y: number }[] = [];
	for (const keyframe of keyframes) {
		const previous = compacted.at(-1);
		if (previous && getCropDistance(previous, keyframe) < 12) {
			continue;
		}

		compacted.push(keyframe);
	}

	return compacted;
}

function buildAnimatedScreenOnlyCropFilter(input: {
	frameWidth: number;
	frameHeight: number;
	targetAspectRatio: number;
	windows: readonly FocusWindow[];
	fallbackRegions: readonly FocusRegion[];
	clipStartSeconds: number;
}): string {
	const baseCrop = getScreenOnlyCrop({
		frameWidth: input.frameWidth,
		frameHeight: input.frameHeight,
		interestRegion: input.fallbackRegions[0] ?? null,
		targetAspectRatio: input.targetAspectRatio,
	});
	const minimumFocusWindowSeconds = 4;
	const focusWindows =
		input.windows.length > 0
			? input.windows
			: [
					{
						startSeconds: input.clipStartSeconds,
						endSeconds: input.clipStartSeconds + 1,
						regions: input.fallbackRegions,
					},
				];
	const crops = focusWindows.map((window) => {
		const crop = getScreenOnlyCropWithSize({
			frameWidth: input.frameWidth,
			frameHeight: input.frameHeight,
			width: baseCrop.width,
			height: baseCrop.height,
			interestRegion: window.regions[0] ?? input.fallbackRegions[0] ?? null,
		});
		const windowDurationSeconds = window.endSeconds - window.startSeconds;
		const stabilizedCrop =
			windowDurationSeconds >= minimumFocusWindowSeconds
				? dampCropTowardAnchor({
						anchorCrop: baseCrop,
						targetCrop: crop,
						frameWidth: input.frameWidth,
						frameHeight: input.frameHeight,
					})
				: baseCrop;

		return {
			atSeconds: Math.max(0, window.startSeconds - input.clipStartSeconds),
			x: stabilizedCrop.x,
			y: stabilizedCrop.y,
		};
	});
	const keyframes = compactCropKeyframes(
		crops.length > 0 ? crops : [{ atSeconds: 0, ...baseCrop }],
	);
	const xExpression = buildAnimatedCropCoordinateExpression(
		keyframes.map((crop) => ({ atSeconds: crop.atSeconds, value: crop.x })),
	);
	const yExpression = buildAnimatedCropCoordinateExpression(
		keyframes.map((crop) => ({ atSeconds: crop.atSeconds, value: crop.y })),
	);

	return `crop=${baseCrop.width}:${baseCrop.height}:${xExpression}:${yExpression},scale=1080:1920,setsar=1,format=yuv420p`;
}

async function renderVerticalClipSegment(input: {
	inputFilePath: string;
	outputFilePath: string;
	startSeconds: number;
	durationSeconds: number;
	frameWidth: number;
	frameHeight: number;
	focusPlan: FocusPlan;
	shortDetectionMode?:
		| "people"
		| "people_and_screen"
		| "product_view"
		| "screen_only";
	subtitleFilePath?: string | null;
	captionStyle?: CaptionStyle;
	onProgress?: (progress: number) => Promise<void>;
}): Promise<void> {
	const windows = input.focusPlan.windows.filter(
		(window) => window.endSeconds > window.startSeconds,
	);
	const workspace = dirname(input.outputFilePath);
	const hasStackedLayout =
		input.shortDetectionMode === "people_and_screen" ||
		windows.some((window) => window.regions.length >= 2);

	if (
		input.shortDetectionMode === "screen_only" ||
		input.shortDetectionMode === "product_view"
	) {
		const sceneOutputPath = input.subtitleFilePath
			? join(workspace, "vertical-scene-no-captions.mp4")
			: input.outputFilePath;
		await renderVerticalSceneSegment({
			inputFilePath: input.inputFilePath,
			outputFilePath: sceneOutputPath,
			startSeconds: input.startSeconds,
			durationSeconds: input.durationSeconds,
			frameWidth: input.frameWidth,
			frameHeight: input.frameHeight,
			regions: input.focusPlan.regions,
			focusWindows: windows,
			shortDetectionMode: input.shortDetectionMode,
			onProgress: async (progress) =>
				input.onProgress?.(input.subtitleFilePath ? progress * 0.75 : progress),
		});

		if (input.subtitleFilePath) {
			await renderCaptionOverlayAndComposite({
				inputFilePath: sceneOutputPath,
				outputFilePath: input.outputFilePath,
				subtitleFilePath: input.subtitleFilePath,
				durationSeconds: input.durationSeconds,
				width: 1080,
				height: 1920,
				captionYRatio: DEFAULT_CAPTION_Y_RATIO,
				captionStyle: input.captionStyle,
				onProgress: async (progress) =>
					input.onProgress?.(75 + progress * 0.25),
			});
		}
		return;
	}

	if (windows.length > 1) {
		const scenePaths = await Promise.all(
			windows.map(async (window, index) => {
				const outputFilePath = join(workspace, `vertical-scene-${index}.mp4`);
				await renderVerticalSceneSegment({
					inputFilePath: input.inputFilePath,
					outputFilePath,
					startSeconds: window.startSeconds,
					durationSeconds: window.endSeconds - window.startSeconds,
					frameWidth: input.frameWidth,
					frameHeight: input.frameHeight,
					regions: window.regions,
					shortDetectionMode: input.shortDetectionMode,
					onProgress: async (progress) =>
						input.onProgress?.(
							((index + progress / 100) / windows.length) *
								(input.subtitleFilePath ? 70 : 100),
						),
				});
				return outputFilePath;
			}),
		);

		const concatOutputPath = input.subtitleFilePath
			? join(workspace, "vertical-scenes-concat.mp4")
			: input.outputFilePath;
		const concatListPath = join(workspace, "vertical-scene-list.txt");
		await writeFile(
			concatListPath,
			scenePaths
				.map((filePath) => `file '${filePath.replaceAll("'", "'\\''")}'`)
				.join("\n"),
			"utf8",
		);

		await runFfmpeg(
			[
				"-y",
				"-f",
				"concat",
				"-safe",
				"0",
				"-i",
				concatListPath,
				"-c",
				"copy",
				"-movflags",
				"+faststart",
				concatOutputPath,
			],
			{
				durationSeconds: input.durationSeconds,
				onProgress: async (progress) =>
					input.onProgress?.(
						input.subtitleFilePath ? 70 + progress * 0.1 : progress,
					),
			},
		);

		if (input.subtitleFilePath) {
			await renderCaptionOverlayAndComposite({
				inputFilePath: concatOutputPath,
				outputFilePath: input.outputFilePath,
				subtitleFilePath: input.subtitleFilePath,
				durationSeconds: input.durationSeconds,
				width: 1080,
				height: 1920,
				captionYRatio: getVerticalCaptionYRatio({ hasStackedLayout }),
				captionStyle: input.captionStyle,
				onProgress: async (progress) => input.onProgress?.(80 + progress * 0.2),
			});
		}
		return;
	}

	const staticRegions = windows[0]?.regions ?? input.focusPlan.regions;
	const hasStaticStackedLayout = staticRegions.length >= 2;
	const sceneOutputPath = input.subtitleFilePath
		? join(workspace, "vertical-scene-no-captions.mp4")
		: input.outputFilePath;
	await renderVerticalSceneSegment({
		inputFilePath: input.inputFilePath,
		outputFilePath: sceneOutputPath,
		startSeconds: input.startSeconds,
		durationSeconds: input.durationSeconds,
		frameWidth: input.frameWidth,
		frameHeight: input.frameHeight,
		regions: staticRegions,
		shortDetectionMode: input.shortDetectionMode,
		onProgress: async (progress) =>
			input.onProgress?.(input.subtitleFilePath ? progress * 0.75 : progress),
	});

	if (input.subtitleFilePath) {
		await renderCaptionOverlayAndComposite({
			inputFilePath: sceneOutputPath,
			outputFilePath: input.outputFilePath,
			subtitleFilePath: input.subtitleFilePath,
			durationSeconds: input.durationSeconds,
			width: 1080,
			height: 1920,
			captionYRatio: getVerticalCaptionYRatio({
				hasStackedLayout: hasStaticStackedLayout,
			}),
			captionStyle: input.captionStyle,
			onProgress: async (progress) => input.onProgress?.(75 + progress * 0.25),
		});
	}
}

async function renderVerticalSceneSegment(input: {
	inputFilePath: string;
	outputFilePath: string;
	startSeconds: number;
	durationSeconds: number;
	frameWidth: number;
	frameHeight: number;
	regions: readonly FocusRegion[];
	focusWindows?: readonly FocusWindow[];
	shortDetectionMode?:
		| "people"
		| "people_and_screen"
		| "product_view"
		| "screen_only";
	onProgress?: (progress: number) => Promise<void>;
}): Promise<void> {
	const regions = input.regions.slice(0, 2);

	if (
		input.shortDetectionMode === "screen_only" ||
		input.shortDetectionMode === "product_view"
	) {
		const screenCrop = getScreenOnlyCrop({
			frameWidth: input.frameWidth,
			frameHeight: input.frameHeight,
			interestRegion: regions[0] ?? null,
			targetAspectRatio: 9 / 16,
		});
		const filter =
			input.focusWindows && input.focusWindows.length > 1
				? buildAnimatedScreenOnlyCropFilter({
						frameWidth: input.frameWidth,
						frameHeight: input.frameHeight,
						targetAspectRatio: 9 / 16,
						windows: input.focusWindows,
						fallbackRegions: regions,
						clipStartSeconds: input.startSeconds,
					})
				: `crop=${screenCrop.width}:${screenCrop.height}:${screenCrop.x}:${screenCrop.y},scale=1080:1920,setsar=1,format=yuv420p`;

		await runFfmpegWithFallback({
			nvidiaArgs: [
				"-y",
				"-ss",
				input.startSeconds.toFixed(3),
				"-i",
				input.inputFilePath,
				"-t",
				input.durationSeconds.toFixed(3),
				"-map",
				"0:v:0",
				"-map",
				"0:a:0?",
				"-vf",
				filter,
				...getNvencOutputArgs(),
				"-c:a",
				"aac",
				"-b:a",
				"160k",
				"-movflags",
				"+faststart",
				input.outputFilePath,
			],
			cpuArgs: [
				"-y",
				"-ss",
				input.startSeconds.toFixed(3),
				"-i",
				input.inputFilePath,
				"-t",
				input.durationSeconds.toFixed(3),
				"-map",
				"0:v:0",
				"-map",
				"0:a:0?",
				"-vf",
				filter,
				...getX264OutputArgs(),
				"-c:a",
				"aac",
				"-b:a",
				"160k",
				"-movflags",
				"+faststart",
				input.outputFilePath,
			],
			durationSeconds: input.durationSeconds,
			onProgress: input.onProgress,
		});
		return;
	}

	if (input.shortDetectionMode === "people_and_screen") {
		const detectedPeopleRegion =
			[...regions].sort((left, right) => right.score - left.score)[0] ?? null;
		const peopleRegion = detectedPeopleRegion ?? {
			centerX: input.frameWidth / 2,
			centerY: input.frameHeight / 2,
			width: null,
			height: null,
		};
		const hasPeopleDetection =
			"score" in peopleRegion &&
			"detectionCount" in peopleRegion &&
			peopleRegion.detectionCount > 0;
		const peopleCrop = getCrop({
			frameWidth: input.frameWidth,
			frameHeight: input.frameHeight,
			centerX: peopleRegion.centerX,
			centerY: hasPeopleDetection
				? peopleRegion.centerY
				: input.frameHeight * 0.58,
			focusWidth: peopleRegion.width,
			focusHeight: peopleRegion.height,
			targetAspectRatio: 1080 / 960,
		});
		const screenCrop = getScreenCropAvoidingFocus({
			frameWidth: input.frameWidth,
			frameHeight: input.frameHeight,
			focusRegion: hasPeopleDetection ? peopleRegion : null,
			targetAspectRatio: 1080 / 960,
		});
		const filterComplex =
			`[0:v]crop=${screenCrop.width}:${screenCrop.height}:${screenCrop.x}:${screenCrop.y},scale=1080:960,setsar=1[screen];` +
			`[0:v]crop=${peopleCrop.width}:${peopleCrop.height}:${peopleCrop.x}:${peopleCrop.y},scale=1080:960,setsar=1[people];` +
			"[screen][people]vstack=inputs=2,format=yuv420p[v]";

		await runFfmpegWithFallback({
			nvidiaArgs: [
				"-y",
				"-ss",
				input.startSeconds.toFixed(3),
				"-i",
				input.inputFilePath,
				"-t",
				input.durationSeconds.toFixed(3),
				"-filter_complex",
				filterComplex,
				"-map",
				"[v]",
				"-map",
				"0:a:0?",
				...getNvencOutputArgs(),
				"-c:a",
				"aac",
				"-b:a",
				"160k",
				"-movflags",
				"+faststart",
				input.outputFilePath,
			],
			cpuArgs: [
				"-y",
				"-ss",
				input.startSeconds.toFixed(3),
				"-i",
				input.inputFilePath,
				"-t",
				input.durationSeconds.toFixed(3),
				"-filter_complex",
				filterComplex,
				"-map",
				"[v]",
				"-map",
				"0:a:0?",
				...getX264OutputArgs(),
				"-c:a",
				"aac",
				"-b:a",
				"160k",
				"-movflags",
				"+faststart",
				input.outputFilePath,
			],
			durationSeconds: input.durationSeconds,
			onProgress: input.onProgress,
		});
		return;
	}

	if (regions.length >= 2) {
		const [topRegion, bottomRegion] = regions as [
			(typeof regions)[number],
			(typeof regions)[number],
		];
		const topCrop = getCrop({
			frameWidth: input.frameWidth,
			frameHeight: input.frameHeight,
			centerX: topRegion.centerX,
			centerY: topRegion.centerY,
			focusWidth: topRegion.width,
			focusHeight: topRegion.height,
			targetAspectRatio: 1080 / 960,
		});
		const bottomCrop = getCrop({
			frameWidth: input.frameWidth,
			frameHeight: input.frameHeight,
			centerX: bottomRegion.centerX,
			centerY: bottomRegion.centerY,
			focusWidth: bottomRegion.width,
			focusHeight: bottomRegion.height,
			targetAspectRatio: 1080 / 960,
		});
		const filterComplex =
			`[0:v]crop=${topCrop.width}:${topCrop.height}:${topCrop.x}:${topCrop.y},scale=1080:960,setsar=1[top];` +
			`[0:v]crop=${bottomCrop.width}:${bottomCrop.height}:${bottomCrop.x}:${bottomCrop.y},scale=1080:960,setsar=1[bottom];` +
			"[top][bottom]vstack=inputs=2,format=yuv420p[v]";

		await runFfmpegWithFallback({
			nvidiaArgs: [
				"-y",
				"-ss",
				input.startSeconds.toFixed(3),
				"-i",
				input.inputFilePath,
				"-t",
				input.durationSeconds.toFixed(3),
				"-filter_complex",
				filterComplex,
				"-map",
				"[v]",
				"-map",
				"0:a:0?",
				...getNvencOutputArgs(),
				"-c:a",
				"aac",
				"-b:a",
				"160k",
				"-movflags",
				"+faststart",
				input.outputFilePath,
			],
			cpuArgs: [
				"-y",
				"-ss",
				input.startSeconds.toFixed(3),
				"-i",
				input.inputFilePath,
				"-t",
				input.durationSeconds.toFixed(3),
				"-filter_complex",
				filterComplex,
				"-map",
				"[v]",
				"-map",
				"0:a:0?",
				...getX264OutputArgs(),
				"-c:a",
				"aac",
				"-b:a",
				"160k",
				"-movflags",
				"+faststart",
				input.outputFilePath,
			],
			durationSeconds: input.durationSeconds,
			onProgress: input.onProgress,
		});
		return;
	}

	const region = regions[0] ?? {
		centerX: input.frameWidth / 2,
		centerY: input.frameHeight / 2,
		width: null,
		height: null,
	};
	const crop = getCrop({
		frameWidth: input.frameWidth,
		frameHeight: input.frameHeight,
		centerX: region.centerX,
		centerY: region.centerY,
		focusWidth: region.width,
		focusHeight: region.height,
		targetAspectRatio: 9 / 16,
	});

	const filter = `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},scale=1080:1920,setsar=1,format=yuv420p`;
	await runFfmpegWithFallback({
		nvidiaArgs: [
			"-y",
			"-ss",
			input.startSeconds.toFixed(3),
			"-i",
			input.inputFilePath,
			"-t",
			input.durationSeconds.toFixed(3),
			"-map",
			"0:v:0",
			"-map",
			"0:a:0?",
			"-vf",
			filter,
			...getNvencOutputArgs(),
			"-c:a",
			"aac",
			"-b:a",
			"160k",
			"-movflags",
			"+faststart",
			input.outputFilePath,
		],
		cpuArgs: [
			"-y",
			"-ss",
			input.startSeconds.toFixed(3),
			"-i",
			input.inputFilePath,
			"-t",
			input.durationSeconds.toFixed(3),
			"-map",
			"0:v:0",
			"-map",
			"0:a:0?",
			"-vf",
			filter,
			...getX264OutputArgs(),
			"-c:a",
			"aac",
			"-b:a",
			"160k",
			"-movflags",
			"+faststart",
			input.outputFilePath,
		],
		durationSeconds: input.durationSeconds,
		onProgress: input.onProgress,
	});
}

async function renderSourceClipSegmentWithSubtitles(input: {
	inputFilePath: string;
	outputFilePath: string;
	startSeconds: number;
	durationSeconds: number;
	subtitleFilePath: string;
	captionStyle?: CaptionStyle;
	onProgress?: (progress: number) => Promise<void>;
}): Promise<void> {
	const workspace = dirname(input.outputFilePath);
	const segmentPath = join(workspace, "source-segment-no-captions.mp4");

	await runFfmpegWithFallback({
		nvidiaArgs: [
			"-y",
			"-ss",
			input.startSeconds.toFixed(3),
			"-i",
			input.inputFilePath,
			"-t",
			input.durationSeconds.toFixed(3),
			"-map",
			"0:v:0",
			"-map",
			"0:a:0?",
			...getNvencOutputArgs(),
			"-c:a",
			"aac",
			"-b:a",
			"160k",
			"-movflags",
			"+faststart",
			segmentPath,
		],
		cpuArgs: [
			"-y",
			"-ss",
			input.startSeconds.toFixed(3),
			"-i",
			input.inputFilePath,
			"-t",
			input.durationSeconds.toFixed(3),
			"-map",
			"0:v:0",
			"-map",
			"0:a:0?",
			...getX264OutputArgs(),
			"-c:a",
			"aac",
			"-b:a",
			"160k",
			"-movflags",
			"+faststart",
			segmentPath,
		],
		durationSeconds: input.durationSeconds,
		onProgress: async (progress) => input.onProgress?.(progress * 0.58),
	});
	const segmentMetadata = await getMediaMetadata(segmentPath);
	await renderCaptionOverlayAndComposite({
		inputFilePath: segmentPath,
		outputFilePath: input.outputFilePath,
		subtitleFilePath: input.subtitleFilePath,
		durationSeconds: input.durationSeconds,
		width: segmentMetadata.width ?? 1920,
		height: segmentMetadata.height ?? 1080,
		captionStyle: input.captionStyle,
		onProgress: async (progress) => input.onProgress?.(58 + progress * 0.42),
	});
}

async function readSubtitleCues(
	filePath: string,
): Promise<RenderSubtitleCue[]> {
	const contents = await readFile(filePath, "utf8");
	const parsed = JSON.parse(contents) as RenderSubtitleCue[];
	return Array.isArray(parsed) ? parsed : [];
}

function getActiveCue(
	cues: readonly RenderSubtitleCue[],
	timeSeconds: number,
): RenderSubtitleCue | null {
	return (
		cues.find(
			(cue) => timeSeconds >= cue.startSeconds && timeSeconds < cue.endSeconds,
		) ?? null
	);
}

function getActiveWordIndex(
	cue: RenderSubtitleCue,
	timeSeconds: number,
): number {
	const index = cue.words.findIndex(
		(word) => timeSeconds >= word.startSeconds && timeSeconds < word.endSeconds,
	);

	return index >= 0 ? index : 0;
}

function getCaptionWords(cue: RenderSubtitleCue): string[] {
	const words =
		cue.words.length > 0
			? cue.words.map((word) => word.text)
			: cue.text.split(/\s+/);
	return words.slice(0, 2).map((word) => word.toUpperCase());
}

function quoteFfmpegConcatPath(filePath: string): string {
	return `'${filePath.replaceAll("'", "'\\''")}'`;
}

function clampSubtitleTime(value: number, durationSeconds: number): number {
	if (!Number.isFinite(value)) {
		return 0;
	}

	return Math.min(durationSeconds, Math.max(0, value));
}

function getGoogleFontCssUrl(fontFamily: string): string {
	const family = encodeURIComponent(fontFamily.trim()).replaceAll("%20", "+");
	return `https://fonts.googleapis.com/css2?family=${family}&display=swap`;
}

function getGoogleFontFileExtension(fontUrl: string): string {
	const extension = fontUrl
		.match(/\.([a-z0-9]+)(?:[?#]|$)/i)?.[1]
		?.toLowerCase();
	return extension ?? "ttf";
}

function parseGoogleFontUrl(css: string): string | null {
	const matches = Array.from(
		css.matchAll(
			/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)\s*format\(['"]?([^'")]+)['"]?\)/g,
		),
	);
	if (matches.length === 0) {
		const fallback = css.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/);
		return fallback?.[1] ?? null;
	}

	const preferredFormats = ["truetype", "opentype", "woff", "woff2"] as const;
	for (const format of preferredFormats) {
		const match = matches.find((entry) => entry[2]?.toLowerCase() === format);
		if (match?.[1]) {
			return match[1];
		}
	}

	return matches[0]?.[1] ?? null;
}

async function fetchGoogleFontCss(fontFamily: string): Promise<string> {
	const cssUrl = getGoogleFontCssUrl(fontFamily);
	const cssRequests: readonly RequestInit[] = [
		{},
		{
			headers: {
				"User-Agent":
					"Mozilla/4.0 (compatible; MSIE 9.0; Windows NT 6.1; Trident/5.0)",
			},
		},
		{
			headers: {
				"User-Agent":
					"Mozilla/5.0 (Windows NT 6.1; WOW64; rv:40.0) Gecko/20100101 Firefox/40.0",
			},
		},
	];

	const cssResults = await Promise.allSettled(
		cssRequests.map(async (request) => {
			const response = await fetch(cssUrl, request);
			if (!response.ok) {
				throw new Error(`Google Fonts returned ${response.status}`);
			}
			return response.text();
		}),
	);
	const cssResponses = cssResults.flatMap((result) =>
		result.status === "fulfilled" ? [result.value] : [],
	);

	const cssWithSupportedFormat = cssResponses.find((css) => {
		const fontUrl = parseGoogleFontUrl(css);
		return fontUrl ? getGoogleFontFileExtension(fontUrl) !== "woff2" : false;
	});

	const fallbackCss = cssResponses[0];
	if (!fallbackCss) {
		throw new Error("Google Fonts CSS could not be fetched");
	}

	return cssWithSupportedFormat ?? fallbackCss;
}

async function downloadAndRegisterGoogleFont(
	fontFamily: string,
): Promise<void> {
	if (SYSTEM_CAPTION_FONTS.has(fontFamily)) {
		return;
	}

	const fontUrl = parseGoogleFontUrl(await fetchGoogleFontCss(fontFamily));
	if (!fontUrl) {
		throw new Error("Google Fonts CSS did not include a font file");
	}

	const fontResponse = await fetch(fontUrl);
	if (!fontResponse.ok) {
		throw new Error(`Google font file returned ${fontResponse.status}`);
	}

	const fontBuffer = Buffer.from(await fontResponse.arrayBuffer());
	const registered = GlobalFonts.register(fontBuffer, fontFamily);
	if (!registered) {
		const fontPath = join(
			tmpdir(),
			`clipse-google-font-${fontFamily
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, "-")
				.replace(/^-|-$/g, "")}.${getGoogleFontFileExtension(fontUrl)}`,
		);
		await writeFile(fontPath, fontBuffer);
		const registeredFromPath = GlobalFonts.registerFromPath(
			fontPath,
			fontFamily,
		);
		if (!registeredFromPath) {
			throw new Error("Downloaded font could not be registered");
		}
	}
}

async function ensureCaptionFontRegistered(fontFamily: string): Promise<void> {
	const normalizedFontFamily = fontFamily.trim();
	if (!normalizedFontFamily || SYSTEM_CAPTION_FONTS.has(normalizedFontFamily)) {
		return;
	}

	const existingPromise =
		GOOGLE_FONT_REGISTRATION_PROMISES.get(normalizedFontFamily);
	if (existingPromise) {
		await existingPromise;
		return;
	}

	const promise = downloadAndRegisterGoogleFont(normalizedFontFamily).catch(
		(error: unknown) => {
			GOOGLE_FONT_REGISTRATION_PROMISES.delete(normalizedFontFamily);
			console.warn(
				`Failed to load Google Font "${normalizedFontFamily}", falling back to system fonts:`,
				error,
			);
		},
	);
	GOOGLE_FONT_REGISTRATION_PROMISES.set(normalizedFontFamily, promise);
	await promise;
}

function setCaptionFont(
	context: ReturnType<ReturnType<typeof createCanvas>["getContext"]>,
	fontSize: number,
	fontFamily: string,
): void {
	const escapedFontFamily = fontFamily.replaceAll('"', "");
	context.font = `900 ${fontSize}px "${escapedFontFamily}", Arial, Helvetica, sans-serif`;
	context.textBaseline = "middle";
}

function fitCaptionFontSize(input: {
	context: ReturnType<ReturnType<typeof createCanvas>["getContext"]>;
	words: readonly string[];
	maxWidth: number;
	fontFamily: string;
}): number {
	for (let fontSize = 108; fontSize >= 58; fontSize -= 4) {
		setCaptionFont(input.context, fontSize, input.fontFamily);
		const totalWidth =
			input.words.reduce(
				(width, word) => width + input.context.measureText(word).width,
				0,
			) +
			Math.max(0, input.words.length - 1) * fontSize * 0.34;

		if (totalWidth <= input.maxWidth) {
			return fontSize;
		}
	}

	return 58;
}

function drawRoundedRect(input: {
	context: ReturnType<ReturnType<typeof createCanvas>["getContext"]>;
	x: number;
	y: number;
	width: number;
	height: number;
	radius: number;
}): void {
	const { context, x, y, width, height, radius } = input;
	context.beginPath();
	context.moveTo(x + radius, y);
	context.lineTo(x + width - radius, y);
	context.quadraticCurveTo(x + width, y, x + width, y + radius);
	context.lineTo(x + width, y + height - radius);
	context.quadraticCurveTo(
		x + width,
		y + height,
		x + width - radius,
		y + height,
	);
	context.lineTo(x + radius, y + height);
	context.quadraticCurveTo(x, y + height, x, y + height - radius);
	context.lineTo(x, y + radius);
	context.quadraticCurveTo(x, y, x + radius, y);
	context.closePath();
}

function drawCaptionFrame(input: {
	cue: RenderSubtitleCue | null;
	timeSeconds: number;
	width: number;
	height: number;
	captionYRatio: number;
	captionStyle?: CaptionStyle;
}): Buffer {
	const canvas = createCanvas(input.width, input.height);
	const context = canvas.getContext("2d");
	context.clearRect(0, 0, input.width, input.height);

	if (!input.cue) {
		return canvas.encodeSync("png");
	}

	const words = getCaptionWords(input.cue);
	if (words.length === 0) {
		return canvas.encodeSync("png");
	}

	const activeWordIndex = getActiveWordIndex(input.cue, input.timeSeconds);
	const captionStyle = input.captionStyle ?? DEFAULT_CAPTION_STYLE;
	const fontSize = fitCaptionFontSize({
		context,
		words,
		maxWidth: input.width * 0.86,
		fontFamily: captionStyle.fontFamily,
	});
	setCaptionFont(context, fontSize, captionStyle.fontFamily);

	const gap = fontSize * 0.34;
	const wordWidths = words.map((word) => context.measureText(word).width);
	const textWidth =
		wordWidths.reduce((total, width) => total + width, 0) +
		Math.max(0, words.length - 1) * gap;
	const x = (input.width - textWidth) / 2;
	const y = input.height * input.captionYRatio;
	const paddingX = fontSize * 0.34;
	const paddingY = fontSize * 0.22;

	context.save();
	context.fillStyle = "rgba(0,0,0,0.28)";
	drawRoundedRect({
		context,
		x: x - paddingX,
		y: y - fontSize / 2 - paddingY,
		width: textWidth + paddingX * 2,
		height: fontSize + paddingY * 2,
		radius: fontSize * 0.24,
	});
	context.fill();
	context.restore();

	let cursorX = x;
	for (const [index, word] of words.entries()) {
		context.lineJoin = "round";
		context.strokeStyle = "black";
		context.lineWidth = index === activeWordIndex ? 12 : 9;
		context.shadowColor = "rgba(0,0,0,0.55)";
		context.shadowBlur = 4;
		context.shadowOffsetY = 7;
		context.strokeText(word, cursorX, y);
		context.shadowColor = "transparent";
		context.fillStyle =
			index === activeWordIndex
				? captionStyle.highlightColor
				: captionStyle.color;
		context.fillText(word, cursorX, y);
		cursorX += (wordWidths[index] ?? 0) + gap;
	}

	return canvas.encodeSync("png");
}

function getCaptionStateBoundaries(input: {
	cues: readonly RenderSubtitleCue[];
	durationSeconds: number;
}): number[] {
	const boundaries = [0, input.durationSeconds];

	for (const cue of input.cues) {
		boundaries.push(
			clampSubtitleTime(cue.startSeconds, input.durationSeconds),
			clampSubtitleTime(cue.endSeconds, input.durationSeconds),
		);

		for (const word of cue.words) {
			boundaries.push(
				clampSubtitleTime(word.startSeconds, input.durationSeconds),
				clampSubtitleTime(word.endSeconds, input.durationSeconds),
			);
		}
	}

	return Array.from(
		new Set(
			boundaries
				.filter((value) => Number.isFinite(value))
				.map((value) => Number(value.toFixed(3))),
		),
	).sort((a, b) => a - b);
}

async function renderCaptionConcatList(input: {
	outputDirectory: string;
	cues: readonly RenderSubtitleCue[];
	durationSeconds: number;
	width: number;
	height: number;
	captionYRatio: number;
	captionStyle?: CaptionStyle;
}): Promise<string> {
	await mkdir(input.outputDirectory, { recursive: true });
	const boundaries = getCaptionStateBoundaries({
		cues: input.cues,
		durationSeconds: input.durationSeconds,
	});
	const lines: string[] = [];
	let lastFramePath: string | null = null;

	for (let index = 0; index < boundaries.length - 1; index += 1) {
		const startSeconds = boundaries[index] ?? 0;
		const endSeconds = boundaries[index + 1] ?? input.durationSeconds;
		const durationSeconds = endSeconds - startSeconds;
		if (durationSeconds <= 0.001) {
			continue;
		}

		const timeSeconds = startSeconds + durationSeconds / 2;
		const framePath = join(
			input.outputDirectory,
			`state-${index.toString().padStart(6, "0")}.png`,
		);
		await writeFile(
			framePath,
			drawCaptionFrame({
				cue: getActiveCue(input.cues, timeSeconds),
				timeSeconds,
				width: input.width,
				height: input.height,
				captionYRatio: input.captionYRatio,
				captionStyle: input.captionStyle,
			}),
		);
		lines.push(`file ${quoteFfmpegConcatPath(framePath)}`);
		lines.push(`duration ${durationSeconds.toFixed(3)}`);
		lastFramePath = framePath;
	}

	if (!lastFramePath) {
		lastFramePath = join(input.outputDirectory, "state-000000.png");
		await writeFile(
			lastFramePath,
			drawCaptionFrame({
				cue: null,
				timeSeconds: 0,
				width: input.width,
				height: input.height,
				captionYRatio: input.captionYRatio,
				captionStyle: input.captionStyle,
			}),
		);
		lines.push(`file ${quoteFfmpegConcatPath(lastFramePath)}`);
		lines.push(`duration ${Math.max(0.001, input.durationSeconds).toFixed(3)}`);
	}

	lines.push(`file ${quoteFfmpegConcatPath(lastFramePath)}`);

	const listPath = join(input.outputDirectory, "captions.concat");
	await writeFile(listPath, `${lines.join("\n")}\n`, "utf8");
	return listPath;
}

async function renderCaptionOverlayAndComposite(input: {
	inputFilePath: string;
	outputFilePath: string;
	subtitleFilePath: string;
	durationSeconds: number;
	width: number;
	height: number;
	captionYRatio?: number;
	captionStyle?: CaptionStyle;
	onProgress?: (progress: number) => Promise<void>;
}): Promise<void> {
	if (input.captionStyle?.fontFamily) {
		await ensureCaptionFontRegistered(input.captionStyle.fontFamily);
	}
	const cues = await readSubtitleCues(input.subtitleFilePath);
	const workspace = dirname(input.outputFilePath);
	const captionListPath = await renderCaptionConcatList({
		outputDirectory: join(workspace, "caption-frames"),
		cues,
		durationSeconds: input.durationSeconds,
		width: input.width,
		height: input.height,
		captionYRatio: input.captionYRatio ?? DEFAULT_CAPTION_Y_RATIO,
		captionStyle: input.captionStyle,
	});
	const filterComplex = `[1:v]fps=30,format=rgba[caption];[0:v][caption]overlay=0:0:format=auto:eof_action=pass,format=yuv420p[v]`;

	await runFfmpegWithFallback({
		nvidiaArgs: [
			"-y",
			"-i",
			input.inputFilePath,
			"-f",
			"concat",
			"-safe",
			"0",
			"-i",
			captionListPath,
			"-filter_complex",
			filterComplex,
			"-map",
			"[v]",
			"-map",
			"0:a:0?",
			...getNvencOutputArgs(),
			"-c:a",
			"copy",
			"-movflags",
			"+faststart",
			input.outputFilePath,
		],
		cpuArgs: [
			"-y",
			"-i",
			input.inputFilePath,
			"-f",
			"concat",
			"-safe",
			"0",
			"-i",
			captionListPath,
			"-filter_complex",
			filterComplex,
			"-map",
			"[v]",
			"-map",
			"0:a:0?",
			...getX264OutputArgs(),
			"-c:a",
			"copy",
			"-movflags",
			"+faststart",
			input.outputFilePath,
		],
		durationSeconds: input.durationSeconds,
		onProgress: input.onProgress,
	});
}

async function applyInternalEdgeFades(input: {
	inputFilePath: string;
	outputFilePath: string;
	fadeIn: boolean;
	fadeOut: boolean;
}): Promise<void> {
	const metadata = await getMediaMetadata(input.inputFilePath);
	const durationSeconds = metadata.durationSeconds;
	const fadeDurationSeconds = Math.min(
		INTERNAL_TRANSITION_SECONDS,
		Math.max(0.08, durationSeconds / 3),
	);
	const videoFilters = [
		input.fadeIn ? `fade=t=in:st=0:d=${fadeDurationSeconds.toFixed(3)}` : null,
		input.fadeOut
			? `fade=t=out:st=${Math.max(0, durationSeconds - fadeDurationSeconds).toFixed(3)}:d=${fadeDurationSeconds.toFixed(3)}`
			: null,
	].filter(Boolean) as string[];
	const audioFilters = metadata.hasAudio
		? ([
				input.fadeIn
					? `afade=t=in:st=0:d=${fadeDurationSeconds.toFixed(3)}`
					: null,
				input.fadeOut
					? `afade=t=out:st=${Math.max(0, durationSeconds - fadeDurationSeconds).toFixed(3)}:d=${fadeDurationSeconds.toFixed(3)}`
					: null,
			].filter(Boolean) as string[])
		: [];

	await runFfmpegWithFallback({
		nvidiaArgs: [
			"-y",
			"-i",
			input.inputFilePath,
			"-map",
			"0:v:0",
			"-map",
			"0:a:0?",
			"-vf",
			videoFilters.join(","),
			...(audioFilters.length > 0 ? ["-af", audioFilters.join(",")] : []),
			"-c:v",
			"h264_nvenc",
			"-profile:v",
			"high",
			"-preset",
			"p4",
			"-rc",
			"vbr",
			"-cq",
			"22",
			"-b:v",
			"0",
			"-r",
			"30",
			"-pix_fmt",
			"yuv420p",
			"-c:a",
			"aac",
			"-b:a",
			"160k",
			"-ar",
			"48000",
			"-ac",
			"2",
			input.outputFilePath,
		],
		cpuArgs: [
			"-y",
			"-i",
			input.inputFilePath,
			"-map",
			"0:v:0",
			"-map",
			"0:a:0?",
			"-vf",
			videoFilters.join(","),
			...(audioFilters.length > 0 ? ["-af", audioFilters.join(",")] : []),
			"-c:v",
			"libx264",
			"-preset",
			"veryfast",
			"-crf",
			"22",
			"-r",
			"30",
			"-pix_fmt",
			"yuv420p",
			"-c:a",
			"aac",
			"-b:a",
			"160k",
			"-ar",
			"48000",
			"-ac",
			"2",
			input.outputFilePath,
		],
	});
}

async function normalizeVideoForConcat(input: {
	inputFilePath: string;
	outputFilePath: string;
	aspectMode?: "source" | "vertical9x16";
}): Promise<void> {
	const videoFilter =
		input.aspectMode === "vertical9x16"
			? [
					"[0:v]split=2[background][foreground]",
					"[background]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=28:steps=2,eq=brightness=-0.12:saturation=0.85[bg]",
					"[foreground]scale=1080:1920:force_original_aspect_ratio=decrease[fg]",
					"[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1,format=yuv420p[v]",
				].join(";")
			: "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2";
	const nvidiaArgs =
		input.aspectMode === "vertical9x16"
			? [
					"-y",
					"-i",
					input.inputFilePath,
					"-filter_complex",
					videoFilter,
					"-map",
					"[v]",
					"-map",
					"0:a:0?",
					"-c:v",
					"h264_nvenc",
					"-profile:v",
					"high",
					"-preset",
					"p4",
					"-rc",
					"vbr",
					"-cq",
					"22",
					"-b:v",
					"0",
					"-r",
					"30",
					"-pix_fmt",
					"yuv420p",
					"-c:a",
					"aac",
					"-b:a",
					"160k",
					"-ar",
					"48000",
					"-ac",
					"2",
					input.outputFilePath,
				]
			: [
					"-y",
					"-hwaccel",
					"cuda",
					"-hwaccel_output_format",
					"cuda",
					"-i",
					input.inputFilePath,
					"-map",
					"0:v:0",
					"-map",
					"0:a:0?",
					"-vf",
					"scale_cuda=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2",
					"-c:v",
					"h264_nvenc",
					"-profile:v",
					"high",
					"-preset",
					"p4",
					"-rc",
					"vbr",
					"-cq",
					"22",
					"-b:v",
					"0",
					"-r",
					"30",
					"-pix_fmt",
					"yuv420p",
					"-c:a",
					"aac",
					"-b:a",
					"160k",
					"-ar",
					"48000",
					"-ac",
					"2",
					input.outputFilePath,
				];

	await runFfmpegWithFallback({
		nvidiaArgs,
		cpuArgs: [
			"-y",
			"-i",
			input.inputFilePath,
			input.aspectMode === "vertical9x16" ? "-filter_complex" : "-vf",
			videoFilter,
			"-map",
			input.aspectMode === "vertical9x16" ? "[v]" : "0:v:0",
			"-map",
			"0:a:0?",
			"-c:v",
			"libx264",
			"-preset",
			"veryfast",
			"-crf",
			"22",
			"-r",
			"30",
			"-pix_fmt",
			"yuv420p",
			"-c:a",
			"aac",
			"-b:a",
			"160k",
			"-ar",
			"48000",
			"-ac",
			"2",
			input.outputFilePath,
		],
	});
}

export async function createPlaybackProxy(input: {
	inputFilePath: string;
	outputFilePath: string;
}): Promise<void> {
	const baseArgs = [
		"-y",
		"-i",
		input.inputFilePath,
		"-map",
		"0:v:0",
		"-map",
		"0:a:0?",
		"-vf",
		"scale=-2:720",
	] as const;

	await runFfmpegWithFallback({
		nvidiaArgs: [
			"-y",
			"-hwaccel",
			"cuda",
			"-hwaccel_output_format",
			"cuda",
			"-i",
			input.inputFilePath,
			"-map",
			"0:v:0",
			"-map",
			"0:a:0?",
			"-vf",
			"scale_cuda=-2:720",
			"-c:v",
			"h264_nvenc",
			"-profile:v",
			"baseline",
			"-level:v",
			"3.1",
			"-preset",
			"p4",
			"-tune",
			"hq",
			"-rc",
			"vbr",
			"-cq",
			"28",
			"-b:v",
			"0",
			"-g",
			"60",
			"-bf",
			"0",
			"-refs",
			"1",
			"-forced-idr",
			"1",
			"-c:a",
			"copy",
			"-movflags",
			"+faststart",
			"-video_track_timescale",
			"90000",
			input.outputFilePath,
		],
		cpuArgs: [
			...baseArgs,
			"-c:v",
			"libx264",
			"-preset",
			"veryfast",
			"-crf",
			"28",
			"-g",
			"60",
			"-keyint_min",
			"60",
			"-sc_threshold",
			"0",
			"-c:a",
			"aac",
			"-b:a",
			"128k",
			"-movflags",
			"+faststart",
			input.outputFilePath,
		],
	});
}

export async function downloadVideoWithYtDlp(input: {
	sourceUrl: string;
	outputDirectory: string;
	onProgress?: (progress: number) => Promise<void>;
	onStatus?: (message: string) => Promise<void>;
}): Promise<{
	filePath: string;
	fileName: string;
	sizeBytes: number;
	mimeType: string;
	title: string | null;
}> {
	const metadata = await getYtDlpMetadata(input.sourceUrl).catch(
		(error: unknown) => {
			console.warn("Failed to read yt-dlp metadata:", error);
			return null;
		},
	);

	await new Promise<void>((resolve, reject) => {
		const process = spawn(
			"yt-dlp",
			getYtDlpArgs(input.sourceUrl, input.outputDirectory),
			{
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
		let stderr = "";
		let lastProgress = 0;
		let lastStatus = "";
		let progressUpdate = Promise.resolve();
		let statusUpdate = Promise.resolve();

		const updateStatus = (message: string) => {
			const progressMatch = message.match(
				/(?:download:\s*)?(?:\[download\]\s*)?([0-9.]+)%/,
			);
			const sanitizedMessage = (
				progressMatch
					? `Downloading video: ${Math.floor(Number.parseFloat(progressMatch[1] ?? "0"))}%`
					: message
			)
				.replace(/\s+/g, " ")
				.replace(/^download:\s*/i, "")
				.trim();
			if (!sanitizedMessage || sanitizedMessage === lastStatus) {
				return;
			}

			lastStatus = sanitizedMessage;
			statusUpdate = statusUpdate.then(() =>
				input.onStatus?.(sanitizedMessage).catch((error: unknown) => {
					console.warn("Failed to update yt-dlp status:", error);
				}),
			);
		};

		const handleOutput = (chunk: Buffer) => {
			const text = chunk.toString("utf8");
			for (const line of text.split(/\r?\n/)) {
				if (line.trim()) {
					updateStatus(line);
				}
			}

			const progressMatches = text.matchAll(
				/(?:download:\s*)?(?:\[download\]\s*)?([0-9.]+)%/g,
			);
			for (const match of progressMatches) {
				const progress = Number.parseFloat(match[1] ?? "");
				if (!Number.isFinite(progress)) {
					continue;
				}

				const roundedProgress = Math.floor(progress);
				if (roundedProgress <= lastProgress) {
					continue;
				}

				lastProgress = roundedProgress;
				progressUpdate = progressUpdate.then(() =>
					input.onProgress?.(roundedProgress).catch((error: unknown) => {
						console.warn("Failed to update yt-dlp progress:", error);
					}),
				);
			}
		};

		process.stdout.on("data", handleOutput);
		process.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString("utf8");
			handleOutput(chunk);
		});
		process.on("error", reject);
		process.on("close", (code) => {
			Promise.all([progressUpdate, statusUpdate])
				.then(() => {
					if (code === 0) {
						resolve();
						return;
					}

					reject(
						new Error(
							`yt-dlp failed with exit code ${code ?? "unknown"}${stderr ? `: ${stderr.trim()}` : ""}`,
						),
					);
				})
				.catch(reject);
		});
	});

	const files = await readdir(input.outputDirectory);
	const downloadedFile = files.find((file) => file.startsWith("source."));
	if (!downloadedFile) {
		throw new Error("yt-dlp did not produce a downloadable video file");
	}

	const filePath = join(input.outputDirectory, downloadedFile);
	const fileStat = await stat(filePath);

	return {
		filePath,
		fileName: basename(filePath),
		sizeBytes: fileStat.size,
		mimeType: downloadedFile.endsWith(".webm") ? "video/webm" : "video/mp4",
		title: metadata?.title?.trim() || null,
	};
}

export async function downloadPlaybackProxyWithYtDlp(input: {
	sourceUrl: string;
	outputDirectory: string;
}): Promise<{
	filePath: string;
	fileName: string;
	mimeType: string;
}> {
	await runBinary("yt-dlp", [
		...getYtDlpBaseArgs(),
		"--merge-output-format",
		"mp4",
		"--remux-video",
		"mp4",
		"-f",
		"bv*[height<=720]+ba/b[height<=720]/b",
		"-o",
		join(input.outputDirectory, "playback-proxy.%(ext)s"),
		input.sourceUrl,
	]);

	const files = await readdir(input.outputDirectory);
	const proxyFile = files.find((file) => file.startsWith("playback-proxy."));
	if (!proxyFile) {
		throw new Error("yt-dlp did not produce a playback proxy file");
	}

	return {
		filePath: join(input.outputDirectory, proxyFile),
		fileName: proxyFile,
		mimeType: proxyFile.endsWith(".webm") ? "video/webm" : "video/mp4",
	};
}

async function getYtDlpMetadata(sourceUrl: string): Promise<{
	title?: string;
}> {
	const stdout = await runBinary("yt-dlp", getYtDlpArgs(sourceUrl));

	const parsed = JSON.parse(stdout) as {
		title?: unknown;
	};

	return {
		title: typeof parsed.title === "string" ? parsed.title : undefined,
	};
}

async function getWaveDataRange(filePath: string): Promise<{
	dataOffset: number;
	dataLength: number;
}> {
	const fileHandle = await open(filePath, "r");
	try {
		const headerBuffer = Buffer.alloc(1024);
		await fileHandle.read(headerBuffer, 0, headerBuffer.length, 0);

		for (let index = 12; index < headerBuffer.length - 8; ) {
			const chunkId = headerBuffer.toString("ascii", index, index + 4);
			const chunkSize = headerBuffer.readUInt32LE(index + 4);

			if (chunkId === "data") {
				return {
					dataOffset: index + 8,
					dataLength: chunkSize,
				};
			}

			index += 8 + chunkSize + (chunkSize % 2);
		}
	} finally {
		await fileHandle.close();
	}

	throw new Error("Failed to locate PCM data chunk for waveform analysis");
}

export async function extractWaveformSamples(
	filePath: string,
	sampleCount = 240,
): Promise<number[]> {
	const { dataOffset, dataLength } = await getWaveDataRange(filePath);
	const fileHandle = await open(filePath, "r");

	try {
		const bytesPerSample = 2;
		const bytesPerWindow = 4096;
		const amplitudes: number[] = [];

		for (let index = 0; index < sampleCount; index++) {
			const progress = sampleCount === 1 ? 0 : index / (sampleCount - 1);
			const windowCenter = Math.floor(
				progress * Math.max(0, dataLength - bytesPerWindow),
			);
			const readPosition = dataOffset + Math.max(0, windowCenter);
			const windowBuffer = Buffer.alloc(bytesPerWindow);
			const { bytesRead } = await fileHandle.read(
				windowBuffer,
				0,
				windowBuffer.length,
				readPosition,
			);

			let maxAmplitude = 0;
			for (
				let offset = 0;
				offset <= bytesRead - bytesPerSample;
				offset += bytesPerSample
			) {
				const amplitude = Math.abs(windowBuffer.readInt16LE(offset)) / 32768;
				if (amplitude > maxAmplitude) {
					maxAmplitude = amplitude;
				}
			}

			amplitudes.push(Number(maxAmplitude.toFixed(4)));
		}

		return amplitudes;
	} finally {
		await fileHandle.close();
	}
}
