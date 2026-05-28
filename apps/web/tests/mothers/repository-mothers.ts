import { vi } from "vitest";
import type { ContentChannelRepositoryInterface as ClipSEChannelRepositoryInterface } from "~/modules/content-channels/domain/content-channel.repository.interface";
import type { ContentChapterRepositoryInterface as ClipSEChapterRepositoryInterface } from "~/modules/content-chapters/domain/content-chapter.repository.interface";
import type { ClipSERepositoryInterface } from "~/modules/content-clips/domain/content-clip.repository.interface";
import type { ContentJobRepositoryInterface as ClipSEJobRepositoryInterface } from "~/modules/content-jobs/domain/content-job.repository.interface";
import type { ContentAiSettingsRepositoryInterface as ClipSEAiSettingsRepositoryInterface } from "~/modules/content-settings/domain/content-ai-settings.repository.interface";
import type { ContentTranscriptionRepositoryInterface as ClipSETranscriptionRepositoryInterface } from "~/modules/content-transcriptions/domain/content-transcription.repository.interface";
import type { ContentVideoRepositoryInterface as ClipSEVideoRepositoryInterface } from "~/modules/content-videos/domain/content-video.repository.interface";
import {
	ClipSEAiSettingsMother,
	ClipSEJobMother,
	ClipSEMother,
	ClipSETranscriptionMother,
	ClipSEVideoMother,
} from "./domain-mothers";

export const ClipSEChannelRepositoryMother = {
	create(
		overrides: Partial<ClipSEChannelRepositoryInterface> = {},
	): ClipSEChannelRepositoryInterface {
		const channel = {
			id: "22222222-2222-4222-8222-222222222222",
			name: "ClipSE Channel",
			logoStorageKey: null,
			logoMimeType: null,
			introStorageKey: null,
			introMimeType: null,
			outroStorageKey: null,
			outroMimeType: null,
			verticalIntroStorageKey: null,
			verticalIntroMimeType: null,
			verticalOutroStorageKey: null,
			verticalOutroMimeType: null,
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

export const ClipSEAiSettingsRepositoryMother = {
	create(
		overrides: Partial<ClipSEAiSettingsRepositoryInterface> = {},
	): ClipSEAiSettingsRepositoryInterface {
		return {
			get: vi.fn(async () => ClipSEAiSettingsMother.create()),
			update: vi.fn(async (input) => ClipSEAiSettingsMother.create(input)),
			...overrides,
		};
	},
};

export const ClipSEVideoRepositoryMother = {
	create(
		overrides: Partial<ClipSEVideoRepositoryInterface> = {},
	): ClipSEVideoRepositoryInterface {
		return {
			createDraft: vi.fn(async () => ClipSEVideoMother.create()),
			delete: vi.fn(async () => undefined),
			findById: vi.fn(async () => ClipSEVideoMother.create()),
			listAll: vi.fn(async () => []),
			listByChannelId: vi.fn(async () => []),
			markDownloaded: vi.fn(async () => ClipSEVideoMother.create()),
			markUploaded: vi.fn(async () => ClipSEVideoMother.create()),
			update: vi.fn(async (input) => ClipSEVideoMother.create(input)),
			updateBumper: vi.fn(async () => ClipSEVideoMother.create()),
			updateStage: vi.fn(async (input) => ClipSEVideoMother.create(input)),
			...overrides,
		};
	},
};

export const ClipSERepositoryMother = {
	create(
		overrides: Partial<ClipSERepositoryInterface> = {},
	): ClipSERepositoryInterface {
		return {
			attachRenderedAsset: vi.fn(async () => ClipSEMother.create()),
			create: vi.fn(async (input) => ClipSEMother.create(input)),
			delete: vi.fn(async () => undefined),
			findById: vi.fn(async () => ClipSEMother.create()),
			listByVideoId: vi.fn(async () => []),
			markDownloaded: vi.fn(async () => ClipSEMother.create()),
			replaceForVideo: vi.fn(async () => []),
			update: vi.fn(async (input) => ClipSEMother.create(input)),
			updateStatus: vi.fn(async (input) => ClipSEMother.create(input)),
			...overrides,
		};
	},
};

export const ClipSEJobRepositoryMother = {
	create(
		overrides: Partial<ClipSEJobRepositoryInterface> = {},
	): ClipSEJobRepositoryInterface {
		return {
			claimNextPending: vi.fn(async () => null),
			clearCompletedAndFailedByVideoId: vi.fn(async () => 0),
			enqueue: vi.fn(async (input) => ClipSEJobMother.create(input)),
			findById: vi.fn(async () => null),
			listByVideoId: vi.fn(async () => []),
			listRecent: vi.fn(async () => []),
			markCompleted: vi.fn(async () => ClipSEJobMother.create()),
			markFailed: vi.fn(async () => ClipSEJobMother.create()),
			requeueStaleRunningJobs: vi.fn(async () => 0),
			updateProgress: vi.fn(async () => ClipSEJobMother.create()),
			...overrides,
		};
	},
};

export const ClipSETranscriptionRepositoryMother = {
	create(
		overrides: Partial<ClipSETranscriptionRepositoryInterface> = {},
	): ClipSETranscriptionRepositoryInterface {
		return {
			findByVideoId: vi.fn(async () => ClipSETranscriptionMother.create()),
			upsert: vi.fn(async () => ClipSETranscriptionMother.create()),
			...overrides,
		};
	},
};

export const ClipSEChapterRepositoryMother = {
	create(
		overrides: Partial<ClipSEChapterRepositoryInterface> = {},
	): ClipSEChapterRepositoryInterface {
		return {
			listByVideoId: vi.fn(async () => []),
			replaceForVideo: vi.fn(async () => []),
			...overrides,
		};
	},
};
