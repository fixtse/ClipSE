import type { ContentChannelRepositoryInterface } from "~/modules/content-channels/domain/content-channel.repository.interface";
import type { ContentChannel } from "~/modules/content-channels/domain/content-channel.valueobject";
import type { ContentChapterRepositoryInterface } from "~/modules/content-chapters/domain/content-chapter.repository.interface";
import type { ContentChapter } from "~/modules/content-chapters/domain/content-chapter.valueobject";
import type { ContentClipRepositoryInterface } from "~/modules/content-clips/domain/content-clip.repository.interface";
import type { ContentClip } from "~/modules/content-clips/domain/content-clip.valueobject";
import type { ContentJobRepositoryInterface } from "~/modules/content-jobs/domain/content-job.repository.interface";
import type { ContentJob } from "~/modules/content-jobs/domain/content-job.valueobject";
import type { ContentTranscriptionRepositoryInterface } from "~/modules/content-transcriptions/domain/content-transcription.repository.interface";
import type { ContentTranscription } from "~/modules/content-transcriptions/domain/content-transcription.valueobject";
import type { ContentVideoRepositoryInterface } from "../domain/content-video.repository.interface";
import type { ContentVideo } from "../domain/content-video.valueobject";

export interface ContentClipDashboardVideo extends ContentVideo {
	activeJob:
		| (Pick<
				ContentJob,
				| "id"
				| "type"
				| "status"
				| "progress"
				| "payload"
				| "clipId"
				| "attempts"
		  > & {
				message: string | null;
		  })
		| null;
	clipCount: number;
	readyClipCount: number;
}

export interface ContentClipDashboardSelectedVideo {
	video: ContentVideo;
	sourceUrl: string | null;
	introUrl: string | null;
	outroUrl: string | null;
	transcription: ContentTranscription | null;
	chapters: ContentChapter[];
	clips: Array<
		ContentClip & {
			sourceUrl: string | null;
			downloadUrl: string | null;
			renderJob:
				| (Pick<ContentJob, "id" | "status" | "progress"> & {
						message: string | null;
				  })
				| null;
		}
	>;
	jobs: ContentJob[];
}

export interface ContentClipDashboardChannel extends ContentChannel {
	logoUrl: string | null;
}

export interface ContentClipDashboard {
	channels: ContentClipDashboardChannel[];
	selectedChannel: ContentClipDashboardChannel | null;
	videos: ContentClipDashboardVideo[];
	selectedVideo: ContentClipDashboardSelectedVideo | null;
	jobs: ContentJob[];
}

function getActiveJob(
	jobs: ContentJob[],
): ContentClipDashboardVideo["activeJob"] {
	const activeJob =
		jobs.find((job) => job.status === "running") ??
		jobs.find((job) => job.status === "pending") ??
		null;

	if (!activeJob) {
		return null;
	}

	return {
		id: activeJob.id,
		type: activeJob.type,
		status: activeJob.status,
		progress: activeJob.progress,
		payload: activeJob.payload,
		clipId: activeJob.clipId,
		attempts: activeJob.attempts,
		message:
			typeof activeJob.result.message === "string"
				? activeJob.result.message
				: null,
	};
}

export async function getContentClipDashboard(
	channelRepository: ContentChannelRepositoryInterface,
	videoRepository: ContentVideoRepositoryInterface,
	transcriptionRepository: ContentTranscriptionRepositoryInterface,
	clipRepository: ContentClipRepositoryInterface,
	chapterRepository: ContentChapterRepositoryInterface,
	jobRepository: ContentJobRepositoryInterface,
	input?: {
		selectedChannelId?: string | null;
		selectedVideoId?: string | null;
	},
): Promise<ContentClipDashboard> {
	const [channels, recentJobs] = await Promise.all([
		channelRepository.listAll(),
		jobRepository.listRecent(24),
	]);
	const dashboardChannels = channels.map((channel) => ({
		...channel,
		logoUrl: channel.logoStorageKey
			? `/api/content/channels/${channel.id}/logo`
			: null,
	}));
	const selectedChannel =
		dashboardChannels.find(
			(channel) => channel.id === input?.selectedChannelId,
		) ??
		dashboardChannels[0] ??
		null;

	if (!selectedChannel) {
		return {
			channels: dashboardChannels,
			selectedChannel: null,
			videos: [],
			selectedVideo: null,
			jobs: recentJobs,
		};
	}

	const videos = await videoRepository.listByChannelId(selectedChannel.id);

	const clipsByVideo = new Map<string, ContentClip[]>();
	const jobsByVideo = new Map<string, ContentJob[]>();

	await Promise.all(
		videos.map(async (video) => {
			const [clips, videoJobs] = await Promise.all([
				clipRepository.listByVideoId(video.id),
				jobRepository.listByVideoId(video.id),
			]);

			clipsByVideo.set(video.id, clips);
			jobsByVideo.set(video.id, videoJobs);
		}),
	);

	const dashboardVideos = videos.map((video) => {
		const clips = clipsByVideo.get(video.id) ?? [];
		const jobs = jobsByVideo.get(video.id) ?? [];

		return {
			...video,
			activeJob: getActiveJob(jobs),
			clipCount: clips.length,
			readyClipCount: clips.filter((clip) => clip.status === "ready").length,
		};
	});

	const selectedVideoId =
		dashboardVideos.find((video) => video.id === input?.selectedVideoId)?.id ??
		dashboardVideos[0]?.id ??
		null;
	if (!selectedVideoId) {
		return {
			channels: dashboardChannels,
			selectedChannel,
			videos: dashboardVideos,
			selectedVideo: null,
			jobs: recentJobs,
		};
	}

	const [selectedVideo, transcription, clips, chapters, jobs] =
		await Promise.all([
			videoRepository.findById(selectedVideoId),
			transcriptionRepository.findByVideoId(selectedVideoId),
			clipRepository.listByVideoId(selectedVideoId),
			chapterRepository.listByVideoId(selectedVideoId),
			jobRepository.listByVideoId(selectedVideoId),
		]);

	if (!selectedVideo) {
		return {
			channels: dashboardChannels,
			selectedChannel,
			videos: dashboardVideos,
			selectedVideo: null,
			jobs: recentJobs,
		};
	}

	return {
		videos: dashboardVideos,
		channels: dashboardChannels,
		selectedChannel,
		selectedVideo: {
			video: selectedVideo,
			sourceUrl: selectedVideo.storageKey
				? `/api/content/videos/${selectedVideo.id}/source`
				: null,
			introUrl: selectedChannel.introStorageKey
				? `/api/content/channels/${selectedChannel.id}/bumpers/intro`
				: null,
			outroUrl: selectedChannel.outroStorageKey
				? `/api/content/channels/${selectedChannel.id}/bumpers/outro`
				: null,
			transcription,
			chapters,
			clips: clips.map((clip) => ({
				...clip,
				sourceUrl: clip.outputStorageKey
					? `/api/content/clips/${clip.id}/source`
					: null,
				downloadUrl: clip.outputStorageKey
					? `/api/content/clips/${clip.id}/download`
					: null,
				renderJob: (() => {
					const renderJob =
						jobs.find(
							(job) =>
								job.clipId === clip.id &&
								job.type === "render-clip" &&
								(job.status === "running" || job.status === "pending"),
						) ??
						jobs.find(
							(job) => job.clipId === clip.id && job.type === "render-clip",
						) ??
						null;

					return renderJob
						? {
								id: renderJob.id,
								status: renderJob.status,
								progress: renderJob.progress,
								message:
									typeof renderJob.result.message === "string"
										? renderJob.result.message
										: null,
							}
						: null;
				})(),
			})),
			jobs,
		},
		jobs: recentJobs,
	};
}
