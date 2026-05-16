import { z } from "zod";
import { contentChannelRepository } from "~/modules/content-channels/infrastructure/content-channel.repository";
import { contentChapterRepository } from "~/modules/content-chapters/infrastructure/content-chapter.repository";
import { contentClipRepository } from "~/modules/content-clips/infrastructure/content-clip.repository";
import { contentJobRepository } from "~/modules/content-jobs/infrastructure/content-job.repository";
import { getContentAiSettings } from "~/modules/content-settings/application/get-content-ai-settings";
import { listContentAiModels } from "~/modules/content-settings/application/list-content-ai-models";
import { CONTENT_AI_PROVIDERS } from "~/modules/content-settings/domain/content-ai-models";
import { contentAiSettingsRepository } from "~/modules/content-settings/infrastructure/content-ai-settings.repository";
import { contentTranscriptionRepository } from "~/modules/content-transcriptions/infrastructure/content-transcription.repository";
import { getClipSEDashboard } from "~/modules/content-videos/application/get-content-clip-dashboard";
import { contentVideoRepository } from "~/modules/content-videos/infrastructure/content-video.repository";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

export const contentClipRouter = createTRPCRouter({
	aiSettings: protectedProcedure.query(async () => {
		return getContentAiSettings(contentAiSettingsRepository);
	}),
	aiModels: protectedProcedure
		.input(
			z.object({
				provider: z.enum(CONTENT_AI_PROVIDERS),
			}),
		)
		.query(async ({ input }) => {
			return listContentAiModels(contentAiSettingsRepository, input.provider);
		}),
	dashboard: protectedProcedure
		.input(
			z
				.object({
					selectedChannelId: z.string().uuid().optional(),
					selectedVideoId: z.string().uuid().optional(),
				})
				.optional(),
		)
		.query(async ({ input }) => {
			return getClipSEDashboard(
				contentChannelRepository,
				contentVideoRepository,
				contentTranscriptionRepository,
				contentClipRepository,
				contentChapterRepository,
				contentJobRepository,
				{
					selectedChannelId: input?.selectedChannelId,
					selectedVideoId: input?.selectedVideoId,
				},
			);
		}),
});
