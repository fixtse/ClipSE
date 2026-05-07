import { randomUUID } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { contentChannelRepository } from "~/modules/content-channels/infrastructure/content-channel.repository";
import { contentChapterRepository } from "~/modules/content-chapters/infrastructure/content-chapter.repository";
import { contentClipRepository } from "~/modules/content-clips/infrastructure/content-clip.repository";
import { contentJobRepository } from "~/modules/content-jobs/infrastructure/content-job.repository";
import { contentTranscriptionRepository } from "~/modules/content-transcriptions/infrastructure/content-transcription.repository";
import {
	buildSourceStorageKey,
	buildVideoTitle,
} from "~/modules/content-videos/domain/content-video.valueobject";
import { contentVideoRepository } from "~/modules/content-videos/infrastructure/content-video.repository";
import { generateClipAndChapterStrategyFromTranscription } from "~/server/lib/contentclip-ai";
import { cacheLocalMediaFile } from "~/server/lib/contentclip-local-media";
import {
	createPlaybackProxy,
	downloadPlaybackProxyWithYtDlp,
	downloadVideoWithYtDlp,
	extractWaveformSamples,
	extractWhisperAudio,
	getMediaMetadata,
	renderClipSegment,
} from "~/server/lib/contentclip-media";
import {
	buildClipFilename,
	buildClipStorageKey,
	downloadStorageObjectToFile,
	uploadLocalFileToStorage,
} from "~/server/lib/contentclip-storage";
import { buildRenderSubtitleCues } from "~/server/lib/contentclip-subtitles";
import { transcribeWithWhisperService } from "~/server/lib/contentclip-whisper";

const runnerId = `contentclip-worker-${randomUUID()}`;

function readRenderAspectMode(value: unknown): "source" | "vertical9x16" {
	return value === "vertical9x16" ? "vertical9x16" : "source";
}

function readRenderBurnSubtitles(value: unknown): boolean {
	return value === true;
}

function scaleProgress(progress: number, base: number, span: number): number {
	return base + Math.floor((Math.max(0, Math.min(100, progress)) / 100) * span);
}

async function sleep(milliseconds: number): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function processTranscriptionJob(
	jobId: string,
	videoId: string,
): Promise<void> {
	const video = await contentVideoRepository.findById(videoId);
	const job = await contentJobRepository.findById(jobId);
	const progressBase =
		typeof job?.payload.progressBase === "number"
			? job.payload.progressBase
			: 0;
	const progressSpan =
		typeof job?.payload.progressSpan === "number"
			? job.payload.progressSpan
			: 100;
	if (!video?.storageKey) {
		throw new Error("Video storage key is missing");
	}

	await contentVideoRepository.updateStage({
		id: videoId,
		processingStage: "transcribing",
		latestError: null,
	});
	await contentJobRepository.updateProgress({
		id: jobId,
		progress: scaleProgress(10, progressBase, progressSpan),
		message: "Downloading source from object storage",
	});

	const workspace = await mkdtemp(join(tmpdir(), "contentclip-transcribe-"));
	const sourcePath = join(workspace, video.originalFilename);
	const audioPath = join(workspace, "transcription.wav");

	await downloadStorageObjectToFile({
		key: video.storageKey,
		filePath: sourcePath,
	});
	await contentJobRepository.updateProgress({
		id: jobId,
		progress: scaleProgress(30, progressBase, progressSpan),
		message: "Extracting audio for Whisper",
	});

	const mediaMetadata = await getMediaMetadata(sourcePath);
	await extractWhisperAudio(sourcePath, audioPath);
	const waveformSamples = await extractWaveformSamples(audioPath);
	await contentJobRepository.updateProgress({
		id: jobId,
		progress: scaleProgress(55, progressBase, progressSpan),
		message: "Transcribing audio with Whisper",
	});

	const transcription = await transcribeWithWhisperService({
		audioFilePath: audioPath,
		languageHint: video.languageHint,
	});
	await contentJobRepository.updateProgress({
		id: jobId,
		progress: scaleProgress(80, progressBase, progressSpan),
		message: "Saving transcript",
	});

	await contentTranscriptionRepository.upsert({
		videoId,
		language: transcription.language,
		provider: "whisper-service",
		model: transcription.model,
		segments: transcription.segments,
		fullText: transcription.text,
		metadata: {
			durationSeconds:
				transcription.durationSeconds ??
				Math.round(mediaMetadata.durationSeconds),
		},
	});

	await contentVideoRepository.updateStage({
		id: videoId,
		processingStage: "ready",
		detectedLanguage: transcription.language,
		durationSeconds: Math.round(
			transcription.durationSeconds ?? mediaMetadata.durationSeconds,
		),
		frameRate: mediaMetadata.frameRate,
		waveformSamples,
		latestError: null,
	});

	await contentJobRepository.markCompleted({
		id: jobId,
		result: {
			durationSeconds: Math.round(
				transcription.durationSeconds ?? mediaMetadata.durationSeconds,
			),
			segmentCount: transcription.segments.length,
			frameRate: mediaMetadata.frameRate,
		},
	});
}

async function processDownloadJob(
	jobId: string,
	videoId: string,
): Promise<void> {
	const video = await contentVideoRepository.findById(videoId);
	const job = await contentJobRepository.findById(jobId);
	const sourceUrl =
		typeof video?.sourceUrl === "string"
			? video.sourceUrl
			: typeof job?.payload.sourceUrl === "string"
				? job.payload.sourceUrl
				: null;

	if (!video || !sourceUrl) {
		throw new Error("Download source URL is missing");
	}

	await contentVideoRepository.updateStage({
		id: videoId,
		processingStage: "uploading",
		latestError: null,
	});
	await contentJobRepository.updateProgress({
		id: jobId,
		progress: 10,
		message: "Starting yt-dlp",
	});

	const workspace = await mkdtemp(join(tmpdir(), "contentclip-download-"));
	const downloaded = await downloadVideoWithYtDlp({
		sourceUrl,
		outputDirectory: workspace,
		onProgress: async (progress) => {
			const currentVideo = await contentVideoRepository.findById(videoId);
			if (!currentVideo) {
				return;
			}

			await contentJobRepository.updateProgress({
				id: jobId,
				progress: 10 + Math.floor(progress * 0.55),
				message: `Downloading video: ${progress}%`,
			});
		},
		onStatus: async (message) => {
			const [currentVideo, currentJob] = await Promise.all([
				contentVideoRepository.findById(videoId),
				contentJobRepository.findById(jobId),
			]);
			if (!currentVideo || !currentJob) {
				return;
			}

			await contentJobRepository.updateProgress({
				id: jobId,
				progress: Math.max(10, currentJob.progress),
				message,
			});
		},
	});
	const currentVideo = await contentVideoRepository.findById(videoId);
	if (!currentVideo) {
		console.info(
			`Download job ${jobId} canceled because video ${videoId} was deleted.`,
		);
		return;
	}

	await contentJobRepository.updateProgress({
		id: jobId,
		progress: 65,
		message: "Uploading downloaded source to object storage",
	});

	const storageKey = buildSourceStorageKey(video.id, downloaded.fileName);
	await contentJobRepository.updateProgress({
		id: jobId,
		progress: 66,
		message: "Downloading 720p playback copy",
	});
	const playbackProxy = await downloadPlaybackProxyWithYtDlp({
		sourceUrl,
		outputDirectory: workspace,
	}).catch(async (error: unknown) => {
		console.warn(
			"Failed to download 720p playback copy, generating local proxy:",
			error,
		);
		const playbackProxyPath = join(workspace, "playback-proxy.mp4");
		await contentJobRepository.updateProgress({
			id: jobId,
			progress: 68,
			message: "Generating playback proxy",
		});
		await createPlaybackProxy({
			inputFilePath: downloaded.filePath,
			outputFilePath: playbackProxyPath,
		});
		return {
			filePath: playbackProxyPath,
			fileName: "playback-proxy.mp4",
			mimeType: "video/mp4",
		};
	});
	await cacheLocalMediaFile({
		storageKey,
		filePath: playbackProxy.filePath,
	});
	await uploadLocalFileToStorage({
		key: storageKey,
		filePath: downloaded.filePath,
		contentType: downloaded.mimeType,
	});
	await contentJobRepository.updateProgress({
		id: jobId,
		progress: 90,
		message: "Queueing transcription",
	});

	await contentVideoRepository.markDownloaded({
		id: currentVideo.id,
		originalFilename: downloaded.fileName,
		title:
			downloaded.title &&
			currentVideo.title === buildVideoTitle(currentVideo.originalFilename)
				? downloaded.title
				: undefined,
		mimeType: downloaded.mimeType,
		sizeBytes: downloaded.sizeBytes,
		storageKey,
	});

	await contentJobRepository.enqueue({
		videoId,
		type: "transcribe-video",
		payload: {
			storageKey,
			queuedBy: "download-source",
			progressBase: 70,
			progressSpan: 25,
		},
	});

	await contentJobRepository.markCompleted({
		id: jobId,
		result: {
			storageKey,
			sizeBytes: downloaded.sizeBytes,
		},
	});
}

async function processAnalysisJob(
	jobId: string,
	videoId: string,
): Promise<void> {
	const [video, transcription] = await Promise.all([
		contentVideoRepository.findById(videoId),
		contentTranscriptionRepository.findByVideoId(videoId),
	]);

	if (!video || !transcription) {
		throw new Error("Video or transcription not found");
	}
	const job = await contentJobRepository.findById(jobId);
	const shouldGenerateClips = job?.payload.generateClips !== false;
	const shouldGenerateChapters = job?.payload.generateChapters !== false;
	const existingClips = shouldGenerateClips
		? []
		: await contentClipRepository.listByVideoId(videoId);

	await contentVideoRepository.updateStage({
		id: videoId,
		processingStage: "analyzing",
		latestError: null,
	});
	await contentJobRepository.updateProgress({ id: jobId, progress: 15 });

	const strategy = await generateClipAndChapterStrategyFromTranscription({
		video,
		transcription,
		generateClips: shouldGenerateClips,
		generateChapters: shouldGenerateChapters,
		existingClips: existingClips.map((clip) => ({
			title: clip.title,
			hook: clip.hook,
			summary: clip.summary,
			rationale: clip.rationale,
			transcriptExcerpt: clip.transcriptExcerpt,
			startSeconds: clip.startSeconds,
			endSeconds: clip.endSeconds,
			score: clip.score,
			tags: clip.tags,
		})),
		onProgress: async (progress) => {
			await contentJobRepository.updateProgress({
				id: jobId,
				progress: 15 + Math.floor(progress * 0.55),
			});
		},
	});
	await contentJobRepository.updateProgress({ id: jobId, progress: 72 });

	await Promise.all([
		shouldGenerateClips
			? contentClipRepository.replaceForVideo(videoId, strategy.clips)
			: Promise.resolve([]),
		shouldGenerateChapters
			? contentChapterRepository.replaceForVideo(videoId, strategy.chapters)
			: Promise.resolve([]),
	]);
	await contentVideoRepository.updateStage({
		id: videoId,
		processingStage: "ready",
		latestError: null,
	});

	await contentJobRepository.markCompleted({
		id: jobId,
		result: {
			clipCount: strategy.clips.length,
			chapterCount: strategy.chapters.length,
		},
	});
}

async function processRenderJob(
	jobId: string,
	videoId: string,
	clipId: string,
): Promise<void> {
	const [video, clip] = await Promise.all([
		contentVideoRepository.findById(videoId),
		contentClipRepository.findById(clipId),
	]);

	if (!video?.storageKey || !clip) {
		throw new Error("Clip or source video not found");
	}

	const channel = video.channelId
		? await contentChannelRepository.findById(video.channelId)
		: null;
	const job = await contentJobRepository.findById(jobId);
	const aspectMode = readRenderAspectMode(job?.payload.aspectMode);
	const burnSubtitles = readRenderBurnSubtitles(job?.payload.burnSubtitles);
	const introStorageKey =
		aspectMode === "vertical9x16"
			? (channel?.verticalIntroStorageKey ?? channel?.introStorageKey)
			: channel?.introStorageKey;
	const outroStorageKey =
		aspectMode === "vertical9x16"
			? (channel?.verticalOutroStorageKey ?? channel?.outroStorageKey)
			: channel?.outroStorageKey;

	await contentClipRepository.updateStatus({
		id: clipId,
		status: "rendering",
		latestError: null,
	});
	await contentJobRepository.updateProgress({
		id: jobId,
		progress: 10,
		message: "Preparing render workspace",
	});

	const workspace = await mkdtemp(join(tmpdir(), "contentclip-render-"));
	const sourcePath = join(workspace, video.originalFilename);
	const introPath = introStorageKey ? join(workspace, "intro.mp4") : null;
	const outroPath = outroStorageKey ? join(workspace, "outro.mp4") : null;
	const outputPath = join(workspace, `${clip.id}.mp4`);
	const subtitlePath = burnSubtitles
		? join(workspace, `${clip.id}.json`)
		: null;

	await downloadStorageObjectToFile({
		key: video.storageKey,
		filePath: sourcePath,
	});
	if (introStorageKey && introPath) {
		await downloadStorageObjectToFile({
			key: introStorageKey,
			filePath: introPath,
		});
	}
	if (outroStorageKey && outroPath) {
		await downloadStorageObjectToFile({
			key: outroStorageKey,
			filePath: outroPath,
		});
	}

	if (burnSubtitles && subtitlePath) {
		await contentJobRepository.updateProgress({
			id: jobId,
			progress: 32,
			message: "Preparing burned subtitles",
		});
		const transcription = await contentTranscriptionRepository.findByVideoId(
			video.id,
		);
		if (!transcription) {
			throw new Error("Transcription is required to burn subtitles");
		}
		const cues = buildRenderSubtitleCues({
			segments: transcription.segments,
			clipStartSeconds: clip.startSeconds,
			clipEndSeconds: clip.endSeconds,
		});
		await writeFile(subtitlePath, JSON.stringify(cues), "utf8");
	}

	await contentJobRepository.updateProgress({
		id: jobId,
		progress: 35,
		message:
			aspectMode === "vertical9x16"
				? "Rendering vertical 9:16 clip"
				: introPath || outroPath
					? "Rendering clip with start/end videos"
					: "Rendering clip segment with ffmpeg",
	});

	await renderClipSegment({
		inputFilePath: sourcePath,
		outputFilePath: outputPath,
		startSeconds: clip.startSeconds,
		endSeconds: clip.endSeconds,
		introFilePath: introPath,
		outroFilePath: outroPath,
		aspectMode,
		subtitleFilePath: subtitlePath,
	});
	await contentJobRepository.updateProgress({
		id: jobId,
		progress: 75,
		message: "Uploading rendered clip",
	});

	const outputStorageKey = buildClipStorageKey(video.id, clip.id);
	const outputFilename = buildClipFilename(clip.title, clip.id);

	await cacheLocalMediaFile({
		storageKey: outputStorageKey,
		filePath: outputPath,
	});
	await uploadLocalFileToStorage({
		key: outputStorageKey,
		filePath: outputPath,
		contentType: "video/mp4",
	});

	await contentClipRepository.attachRenderedAsset({
		id: clip.id,
		outputStorageKey,
		outputFilename,
	});

	await contentJobRepository.markCompleted({
		id: jobId,
		result: {
			outputStorageKey,
			outputFilename,
			aspectMode,
			burnSubtitles,
		},
	});
}

async function processJob(): Promise<boolean> {
	const job = await contentJobRepository.claimNextPending(runnerId);
	if (!job) {
		return false;
	}

	try {
		if (job.type === "transcribe-video") {
			if (!job.videoId) {
				throw new Error("Transcription job is missing videoId");
			}
			await processTranscriptionJob(job.id, job.videoId);
			return true;
		}

		if (job.type === "download-source") {
			if (!job.videoId) {
				throw new Error("Download job is missing videoId");
			}
			await processDownloadJob(job.id, job.videoId);
			return true;
		}

		if (job.type === "analyze-video") {
			if (!job.videoId) {
				throw new Error("Analysis job is missing videoId");
			}
			await processAnalysisJob(job.id, job.videoId);
			return true;
		}

		if (job.type === "render-clip") {
			if (!job.videoId || !job.clipId) {
				throw new Error("Render job is missing videoId or clipId");
			}
			await processRenderJob(job.id, job.videoId, job.clipId);
			return true;
		}

		throw new Error(`Unsupported job type: ${job.type}`);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown worker failure";

		console.error(`Job ${job.id} failed:`, error);

		await contentJobRepository
			.markFailed({
				id: job.id,
				error: message,
			})
			.catch((markError: unknown) => {
				console.warn(`Failed to mark job ${job.id} failed:`, markError);
			});

		if (job.type === "render-clip" && job.clipId) {
			await contentClipRepository.updateStatus({
				id: job.clipId,
				status: "failed",
				latestError: message,
			});
		}

		if (
			(job.type === "download-source" ||
				job.type === "transcribe-video" ||
				job.type === "analyze-video") &&
			job.videoId
		) {
			const video = await contentVideoRepository.findById(job.videoId);
			if (video) {
				await contentVideoRepository.updateStage({
					id: job.videoId,
					processingStage: "failed",
					latestError: message,
				});
			}
		}

		return true;
	}
}

async function main(): Promise<void> {
	console.info(`[worker] starting ${runnerId}`);
	const recoveredJobs = await contentJobRepository.requeueStaleRunningJobs({
		runnerId,
		staleBefore: new Date(Date.now() - 5 * 60 * 1000),
	});
	if (recoveredJobs > 0) {
		console.info(`[worker] requeued ${recoveredJobs} stale running job(s)`);
	}

	for (;;) {
		const processedJob = await processJob();
		if (!processedJob) {
			await sleep(2000);
		}
	}
}

void main().catch((error) => {
	console.error("[worker] fatal error:", error);
	process.exit(1);
});
