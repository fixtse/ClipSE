import { execFile, spawn } from "node:child_process";
import { open, readdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function runBinary(command: string, args: string[]): Promise<string> {
	const { stdout, stderr } = await execFileAsync(command, args, {
		maxBuffer: 1024 * 1024 * 20,
	});

	if (stderr) {
		console.info(`[${command}] ${stderr}`);
	}

	return stdout.trim();
}

function getYtDlpBaseArgs(): string[] {
	const cookiesFile = process.env.CONTENTCLIP_YTDLP_COOKIES_FILE?.trim();
	const userAgent = process.env.CONTENTCLIP_YTDLP_USER_AGENT?.trim();
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
}): Promise<void> {
	try {
		await runBinary("ffmpeg", input.nvidiaArgs);
	} catch (error) {
		console.warn("NVIDIA ffmpeg path failed, falling back to CPU:", error);
		await runBinary("ffmpeg", input.cpuArgs);
	}
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
}

const INTERNAL_TRANSITION_SECONDS = 0.35;

export async function getMediaMetadata(
	filePath: string,
): Promise<MediaMetadata> {
	const stdout = await runBinary("ffprobe", [
		"-v",
		"error",
		"-print_format",
		"json",
		"-show_entries",
		"format=duration:stream=codec_type,avg_frame_rate",
		filePath,
	]);

	const parsed = JSON.parse(stdout) as {
		format?: { duration?: string };
		streams?: Array<{ codec_type?: string; avg_frame_rate?: string }>;
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
}): Promise<void> {
	const durationSeconds = Math.max(1, input.endSeconds - input.startSeconds);
	const workspace = dirname(input.outputFilePath);
	const segmentOutputPath =
		input.introFilePath || input.outroFilePath
			? join(workspace, "clip-segment.mp4")
			: input.outputFilePath;

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
	});

	const concatInputs = [
		input.introFilePath,
		segmentOutputPath,
		input.outroFilePath,
	].filter(Boolean) as string[];

	if (concatInputs.length <= 1) {
		return;
	}

	const normalizedPaths = await Promise.all(
		concatInputs.map(async (filePath, index) => {
			const normalizedPath = join(workspace, `concat-${index}.mp4`);
			await normalizeVideoForConcat({
				inputFilePath: filePath,
				outputFilePath: normalizedPath,
			});
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

	await runBinary("ffmpeg", [
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
	]);
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
}): Promise<void> {
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
			"scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2",
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
