import { vi } from "vitest";
import type { ContentChannelRepositoryInterface } from "~/modules/content-channels/domain/content-channel.repository.interface";
import type { ContentChapterRepositoryInterface } from "~/modules/content-chapters/domain/content-chapter.repository.interface";
import type { ContentClipRepositoryInterface } from "~/modules/content-clips/domain/content-clip.repository.interface";
import type { ContentJobRepositoryInterface } from "~/modules/content-jobs/domain/content-job.repository.interface";
import type { ContentAiSettingsRepositoryInterface } from "~/modules/content-settings/domain/content-ai-settings.repository.interface";
import type { ContentTranscriptionRepositoryInterface } from "~/modules/content-transcriptions/domain/content-transcription.repository.interface";
import type { ContentVideoRepositoryInterface } from "~/modules/content-videos/domain/content-video.repository.interface";
import {
	ContentAiSettingsMother,
	ContentClipMother,
	ContentJobMother,
	ContentTranscriptionMother,
	ContentVideoMother,
} from "./domain-mothers";

export const ContentChannelRepositoryMother = {
	create(
		overrides: Partial<ContentChannelRepositoryInterface> = {},
	): ContentChannelRepositoryInterface {
		const channel = {
			id: "22222222-2222-4222-8222-222222222222",
			name: "Content Channel",
			logoStorageKey: null,
			logoMimeType: null,
			introStorageKey: null,
			introMimeType: null,
			outroStorageKey: null,
			outroMimeType: null,
			createdAt: new Date("2026-01-01T00:00:00.000Z"),
			updatedAt: new Date("2026-01-01T00:00:00.000Z"),
		};

		return {
			create: vi.fn(async (input) => ({ ...channel, ...input })),
			findById: vi.fn(async () => channel),
			listAll: vi.fn(async () => [channel]),
			updateBumper: vi.fn(async () => channel),
			updateLogo: vi.fn(async () => channel),
			...overrides,
		};
	},
};

export const ContentAiSettingsRepositoryMother = {
	create(
		overrides: Partial<ContentAiSettingsRepositoryInterface> = {},
	): ContentAiSettingsRepositoryInterface {
		return {
			get: vi.fn(async () => ContentAiSettingsMother.create()),
			update: vi.fn(async (input) => ContentAiSettingsMother.create(input)),
			...overrides,
		};
	},
};

export const ContentVideoRepositoryMother = {
	create(
		overrides: Partial<ContentVideoRepositoryInterface> = {},
	): ContentVideoRepositoryInterface {
		return {
			createDraft: vi.fn(async () => ContentVideoMother.create()),
			delete: vi.fn(async () => undefined),
			findById: vi.fn(async () => ContentVideoMother.create()),
			listAll: vi.fn(async () => []),
			listByChannelId: vi.fn(async () => []),
			markDownloaded: vi.fn(async () => ContentVideoMother.create()),
			markUploaded: vi.fn(async () => ContentVideoMother.create()),
			update: vi.fn(async (input) => ContentVideoMother.create(input)),
			updateBumper: vi.fn(async () => ContentVideoMother.create()),
			updateStage: vi.fn(async (input) => ContentVideoMother.create(input)),
			...overrides,
		};
	},
};

export const ContentClipRepositoryMother = {
	create(
		overrides: Partial<ContentClipRepositoryInterface> = {},
	): ContentClipRepositoryInterface {
		return {
			attachRenderedAsset: vi.fn(async () => ContentClipMother.create()),
			create: vi.fn(async (input) => ContentClipMother.create(input)),
			delete: vi.fn(async () => undefined),
			findById: vi.fn(async () => ContentClipMother.create()),
			listByVideoId: vi.fn(async () => []),
			markDownloaded: vi.fn(async () => ContentClipMother.create()),
			replaceForVideo: vi.fn(async () => []),
			update: vi.fn(async (input) => ContentClipMother.create(input)),
			updateStatus: vi.fn(async (input) => ContentClipMother.create(input)),
			...overrides,
		};
	},
};

export const ContentJobRepositoryMother = {
	create(
		overrides: Partial<ContentJobRepositoryInterface> = {},
	): ContentJobRepositoryInterface {
		return {
			claimNextPending: vi.fn(async () => null),
			clearCompletedAndFailedByVideoId: vi.fn(async () => 0),
			enqueue: vi.fn(async (input) => ContentJobMother.create(input)),
			findById: vi.fn(async () => null),
			listByVideoId: vi.fn(async () => []),
			listRecent: vi.fn(async () => []),
			markCompleted: vi.fn(async () => ContentJobMother.create()),
			markFailed: vi.fn(async () => ContentJobMother.create()),
			requeueStaleRunningJobs: vi.fn(async () => 0),
			updateProgress: vi.fn(async () => ContentJobMother.create()),
			...overrides,
		};
	},
};

export const ContentTranscriptionRepositoryMother = {
	create(
		overrides: Partial<ContentTranscriptionRepositoryInterface> = {},
	): ContentTranscriptionRepositoryInterface {
		return {
			findByVideoId: vi.fn(async () => ContentTranscriptionMother.create()),
			upsert: vi.fn(async () => ContentTranscriptionMother.create()),
			...overrides,
		};
	},
};

export const ContentChapterRepositoryMother = {
	create(
		overrides: Partial<ContentChapterRepositoryInterface> = {},
	): ContentChapterRepositoryInterface {
		return {
			listByVideoId: vi.fn(async () => []),
			replaceForVideo: vi.fn(async () => []),
			...overrides,
		};
	},
};
