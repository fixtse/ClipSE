import type { ContentChapter } from "~/modules/content-chapters/domain/content-chapter.valueobject";
import type {
	ClipSE,
	GeneratedClipCandidate,
} from "~/modules/content-clips/domain/content-clip.valueobject";
import type { ContentJob } from "~/modules/content-jobs/domain/content-job.valueobject";
import type { ContentAiSettings } from "~/modules/content-settings/domain/content-ai-settings.valueobject";
import type { ContentTranscription } from "~/modules/content-transcriptions/domain/content-transcription.valueobject";
import type {
	ClipItem,
	TranscriptSegment,
} from "~/modules/content-videos/application/content-clip-dashboard-view";
import type { ClipSEDashboardVideo } from "~/modules/content-videos/application/get-content-clip-dashboard";
import type { ContentVideo } from "~/modules/content-videos/domain/content-video.valueobject";

const BASE_DATE = "2026-01-01T00:00:00.000Z";

const date = (value: Date | string = BASE_DATE): Date => new Date(value);

const cloneRecord = (
	value: Record<string, unknown> | undefined,
): Record<string, unknown> => ({ ...(value ?? {}) });

export const ContentVideoMother = {
	create(overrides: Partial<ContentVideo> = {}): ContentVideo {
		const video: ContentVideo = {
			id: "11111111-1111-4111-8111-111111111111",
			channelId: "22222222-2222-4222-8222-222222222222",
			originalFilename: "source-video.mp4",
			title: "Source video",
			analysisPrompt: "",
			sourceType: "file",
			sourceUrl: null,
			languageHint: "auto",
			detectedLanguage: null,
			storageKey: "videos/source-video.mp4",
			introStorageKey: null,
			introMimeType: null,
			outroStorageKey: null,
			outroMimeType: null,
			mimeType: "video/mp4",
			sizeBytes: 1024 * 1024,
			durationSeconds: 120,
			frameRate: 30,
			waveformSamples: [0.1, 0.4, 0.8],
			processingStage: "ready",
			latestError: null,
			uploadCompletedAt: date(),
			createdAt: date(),
			updatedAt: date(),
		};

		return {
			...video,
			...overrides,
			waveformSamples: [...(overrides.waveformSamples ?? [0.1, 0.4, 0.8])],
			uploadCompletedAt:
				overrides.uploadCompletedAt === undefined
					? date()
					: overrides.uploadCompletedAt
						? date(overrides.uploadCompletedAt)
						: null,
			createdAt: overrides.createdAt ? date(overrides.createdAt) : date(),
			updatedAt: overrides.updatedAt ? date(overrides.updatedAt) : date(),
		};
	},
};

export const ClipSEMother = {
	create(overrides: Partial<ClipSE> = {}): ClipSE {
		const clip: ClipSE = {
			id: "33333333-3333-4333-8333-333333333333",
			videoId: "11111111-1111-4111-8111-111111111111",
			clipKind: "standard",
			shortDetectionMode: "people",
			orderIndex: 0,
			title: "Clip title",
			hook: "Clip hook",
			summary: "Clip summary",
			rationale: "Manual clip",
			transcriptExcerpt: "Transcript excerpt",
			startSeconds: 10,
			endSeconds: 30,
			score: 80,
			status: "suggested",
			tags: ["launch"],
			outputStorageKey: null,
			outputFilename: null,
			downloadedAt: null,
			latestError: null,
			createdAt: date(),
			updatedAt: date(),
		};

		return {
			...clip,
			...overrides,
			tags: [...(overrides.tags ?? ["launch"])],
			downloadedAt: overrides.downloadedAt
				? date(overrides.downloadedAt)
				: null,
			createdAt: overrides.createdAt ? date(overrides.createdAt) : date(),
			updatedAt: overrides.updatedAt ? date(overrides.updatedAt) : date(),
		};
	},
};

export const GeneratedClipCandidateMother = {
	create(
		overrides: Partial<GeneratedClipCandidate> = {},
	): GeneratedClipCandidate {
		const candidate: GeneratedClipCandidate = {
			title: "Generated clip",
			hook: "Generated hook",
			summary: "Generated summary",
			rationale: "Generated rationale",
			transcriptExcerpt: "Generated transcript excerpt",
			startSeconds: 10,
			endSeconds: 30,
			score: 75,
			tags: ["generated"],
		};

		return {
			...candidate,
			...overrides,
			tags: [...(overrides.tags ?? ["generated"])],
		};
	},
};

export const ContentJobMother = {
	create(overrides: Partial<ContentJob> = {}): ContentJob {
		const job: ContentJob = {
			id: "44444444-4444-4444-8444-444444444444",
			videoId: "11111111-1111-4111-8111-111111111111",
			clipId: null,
			type: "transcribe-video",
			status: "pending",
			progress: 0,
			attempts: 0,
			maxAttempts: 3,
			payload: {},
			result: {},
			runnerId: null,
			lastError: null,
			startedAt: null,
			completedAt: null,
			lockedAt: null,
			createdAt: date(),
			updatedAt: date(),
		};

		return {
			...job,
			...overrides,
			payload: cloneRecord(overrides.payload),
			result: cloneRecord(overrides.result),
			startedAt: overrides.startedAt ? date(overrides.startedAt) : null,
			completedAt: overrides.completedAt ? date(overrides.completedAt) : null,
			lockedAt: overrides.lockedAt ? date(overrides.lockedAt) : null,
			createdAt: overrides.createdAt ? date(overrides.createdAt) : date(),
			updatedAt: overrides.updatedAt ? date(overrides.updatedAt) : date(),
		};
	},
};

export const DashboardVideoMother = {
	create(overrides: Partial<ClipSEDashboardVideo> = {}): ClipSEDashboardVideo {
		return {
			...ContentVideoMother.create(overrides),
			activeJob: overrides.activeJob ?? null,
			clipCount: overrides.clipCount ?? 0,
			readyClipCount: overrides.readyClipCount ?? 0,
			shortCount: overrides.shortCount ?? 0,
			readyShortCount: overrides.readyShortCount ?? 0,
		};
	},
};

export const DashboardClipMother = {
	create(overrides: Partial<ClipItem> = {}): ClipItem {
		return {
			...ClipSEMother.create(overrides),
			sourceUrl: overrides.sourceUrl ?? null,
			downloadUrl: overrides.downloadUrl ?? null,
			renderJob: overrides.renderJob ?? null,
		};
	},
};

export const DashboardChapterMother = {
	create(overrides: Partial<ContentChapter> = {}): ContentChapter {
		const chapter: ContentChapter = {
			id: "55555555-5555-4555-8555-555555555555",
			videoId: "11111111-1111-4111-8111-111111111111",
			orderIndex: 0,
			title: "Intro",
			startSeconds: 0,
			endSeconds: 20,
			summary: "",
			relatedClipIndexes: [],
			confidence: 0.9,
			createdAt: date(),
			updatedAt: date(),
		};

		return {
			...chapter,
			...overrides,
			relatedClipIndexes: [...(overrides.relatedClipIndexes ?? [])],
			createdAt: overrides.createdAt ? date(overrides.createdAt) : date(),
			updatedAt: overrides.updatedAt ? date(overrides.updatedAt) : date(),
		};
	},
};

export const TranscriptSegmentMother = {
	create(overrides: Partial<TranscriptSegment> = {}): TranscriptSegment {
		return {
			start: 0,
			end: 2,
			text: "Opening hook",
			...overrides,
		};
	},
};

export const ContentTranscriptionMother = {
	create(overrides: Partial<ContentTranscription> = {}): ContentTranscription {
		const transcription: ContentTranscription = {
			id: "66666666-6666-4666-8666-666666666666",
			videoId: "11111111-1111-4111-8111-111111111111",
			language: "en",
			provider: "whisper",
			model: "large-v3-turbo",
			segments: [TranscriptSegmentMother.create()],
			fullText: "Opening hook",
			metadata: {},
			createdAt: date(),
			updatedAt: date(),
		};

		return {
			...transcription,
			...overrides,
			segments: (overrides.segments ?? [TranscriptSegmentMother.create()]).map(
				(segment) => ({ ...segment }),
			),
			metadata: cloneRecord(overrides.metadata),
			createdAt: overrides.createdAt ? date(overrides.createdAt) : date(),
			updatedAt: overrides.updatedAt ? date(overrides.updatedAt) : date(),
		};
	},
};

export const ContentAiSettingsMother = {
	create(overrides: Partial<ContentAiSettings> = {}): ContentAiSettings {
		const settings: ContentAiSettings = {
			id: 1,
			provider: "openai",
			openaiApiKey: "openai-key",
			openaiBaseUrl: "https://api.openai.com/v1",
			openaiModel: "gpt-5.1",
			geminiApiKey: "gemini-key",
			geminiModel: "gemini-3-pro",
			openrouterApiKey: "openrouter-key",
			openrouterModel: "openrouter/model",
			codexModel: "gpt-5.3-codex",
			whisperProvider: "faster-whisper",
			whisperModel: "medium",
			whisperChunkingEnabled: false,
			whisperChunkMinutes: 20,
			createdAt: date(),
			updatedAt: date(),
		};

		return {
			...settings,
			...overrides,
			createdAt: overrides.createdAt ? date(overrides.createdAt) : date(),
			updatedAt: overrides.updatedAt ? date(overrides.updatedAt) : date(),
		};
	},
};
