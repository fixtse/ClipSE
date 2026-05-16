import { describe, expect, it, vi } from "vitest";
import { getClipSEDashboard } from "~/modules/content-videos/application/get-content-clip-dashboard";
import {
	ClipSEMother,
	ContentJobMother,
	ContentTranscriptionMother,
	ContentVideoMother,
	DashboardChapterMother,
} from "../../../mothers/domain-mothers";
import {
	ClipSERepositoryMother,
	ContentChannelRepositoryMother,
	ContentChapterRepositoryMother,
	ContentJobRepositoryMother,
	ContentTranscriptionRepositoryMother,
	ContentVideoRepositoryMother,
} from "../../../mothers/repository-mothers";

describe("getClipSEDashboard", () => {
	it("returns an empty dashboard when no channels exist", async () => {
		const channelRepository = ContentChannelRepositoryMother.create({
			listAll: vi.fn(async () => []),
		});
		const jobRepository = ContentJobRepositoryMother.create({
			listRecent: vi.fn(async () => [ContentJobMother.create()]),
		});

		await expect(
			getClipSEDashboard(
				channelRepository,
				ContentVideoRepositoryMother.create(),
				ContentTranscriptionRepositoryMother.create(),
				ClipSERepositoryMother.create(),
				ContentChapterRepositoryMother.create(),
				jobRepository,
			),
		).resolves.toMatchObject({
			channels: [],
			selectedChannel: null,
			videos: [],
			selectedVideo: null,
		});
		expect(jobRepository.listRecent).toHaveBeenCalledWith(24);
	});

	it("assembles channels, library videos, selected video assets, and render jobs", async () => {
		const channel = {
			id: "22222222-2222-4222-8222-222222222222",
			name: "Channel",
			logoStorageKey: "channels/logo.png",
			logoMimeType: "image/png",
			introStorageKey: "channels/intro.mp4",
			introMimeType: "video/mp4",
			outroStorageKey: "channels/outro.mp4",
			outroMimeType: "video/mp4",
			verticalIntroStorageKey: "channels/vertical-intro.mp4",
			verticalIntroMimeType: "video/mp4",
			verticalOutroStorageKey: "channels/vertical-outro.mp4",
			verticalOutroMimeType: "video/mp4",
			createdAt: new Date(0),
			updatedAt: new Date(0),
		};
		const video = ContentVideoMother.create({
			channelId: channel.id,
			storageKey: "videos/source.mp4",
		});
		const readyClip = ClipSEMother.create({
			id: "33333333-3333-4333-8333-333333333333",
			status: "ready",
			outputStorageKey: "clips/rendered.mp4",
		});
		const pendingJob = ContentJobMother.create({
			id: "44444444-4444-4444-8444-444444444444",
			type: "transcribe-video",
			status: "pending",
			result: { message: "Waiting" },
		});
		const renderJob = ContentJobMother.create({
			id: "44444444-4444-4444-8444-444444444445",
			type: "render-clip",
			status: "running",
			clipId: readyClip.id,
			progress: 55,
			result: { message: "Rendering" },
		});

		const dashboard = await getClipSEDashboard(
			ContentChannelRepositoryMother.create({
				listAll: vi.fn(async () => [channel]),
			}),
			ContentVideoRepositoryMother.create({
				findById: vi.fn(async () => video),
				listByChannelId: vi.fn(async () => [video]),
			}),
			ContentTranscriptionRepositoryMother.create({
				findByVideoId: vi.fn(async () =>
					ContentTranscriptionMother.create({ videoId: video.id }),
				),
			}),
			ClipSERepositoryMother.create({
				listByVideoId: vi.fn(async () => [readyClip]),
			}),
			ContentChapterRepositoryMother.create({
				listByVideoId: vi.fn(async () => [DashboardChapterMother.create()]),
			}),
			ContentJobRepositoryMother.create({
				listByVideoId: vi.fn(async () => [pendingJob, renderJob]),
				listRecent: vi.fn(async () => [pendingJob]),
			}),
			{ selectedChannelId: channel.id, selectedVideoId: video.id },
		);

		expect(dashboard.selectedChannel?.logoUrl).toBe(
			`/api/content/channels/${channel.id}/logo`,
		);
		expect(dashboard.videos[0]).toMatchObject({
			id: video.id,
			clipCount: 1,
			readyClipCount: 1,
			activeJob: {
				id: renderJob.id,
				message: "Rendering",
			},
		});
		expect(dashboard.selectedVideo).toMatchObject({
			sourceUrl: `/api/content/videos/${video.id}/source`,
			introUrl: `/api/content/channels/${channel.id}/bumpers/intro`,
			outroUrl: `/api/content/channels/${channel.id}/bumpers/outro`,
		});
		expect(dashboard.selectedVideo?.clips[0]).toMatchObject({
			sourceUrl: `/api/content/clips/${readyClip.id}/source`,
			downloadUrl: `/api/content/clips/${readyClip.id}/download`,
			renderJob: {
				id: renderJob.id,
				status: "running",
				progress: 55,
				message: "Rendering",
			},
		});
	});

	it("falls back to the first channel and handles a missing selected video", async () => {
		const channel = {
			id: "22222222-2222-4222-8222-222222222222",
			name: "Fallback channel",
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
			createdAt: new Date(0),
			updatedAt: new Date(0),
		};
		const video = ContentVideoMother.create({
			channelId: channel.id,
			storageKey: null,
		});

		const dashboard = await getClipSEDashboard(
			ContentChannelRepositoryMother.create({
				listAll: vi.fn(async () => [channel]),
			}),
			ContentVideoRepositoryMother.create({
				findById: vi.fn(async () => null),
				listByChannelId: vi.fn(async () => [video]),
			}),
			ContentTranscriptionRepositoryMother.create(),
			ClipSERepositoryMother.create({
				listByVideoId: vi.fn(async () => []),
			}),
			ContentChapterRepositoryMother.create(),
			ContentJobRepositoryMother.create({
				listByVideoId: vi.fn(async () => []),
			}),
			{
				selectedChannelId: "missing-channel",
				selectedVideoId: "missing-video",
			},
		);

		expect(dashboard.selectedChannel).toMatchObject({
			id: channel.id,
			logoUrl: null,
		});
		expect(dashboard.videos).toHaveLength(1);
		expect(dashboard.selectedVideo).toBeNull();
	});
});
