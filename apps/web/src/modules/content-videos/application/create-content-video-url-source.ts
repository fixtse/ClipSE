import type { ContentJobRepositoryInterface } from "~/modules/content-jobs/domain/content-job.repository.interface";
import type { ContentVideoRepositoryInterface } from "../domain/content-video.repository.interface";
import {
	type ContentVideo,
	CreateContentVideoDraftSchema,
} from "../domain/content-video.valueobject";

export async function createContentVideoUrlSource(
	videoRepository: ContentVideoRepositoryInterface,
	jobRepository: ContentJobRepositoryInterface,
	input: {
		channelId?: string;
		sourceUrl: string;
		title?: string;
		analysisPrompt?: string;
		languageHint?: string;
	},
): Promise<ContentVideo> {
	const url = new URL(input.sourceUrl);
	const draft = CreateContentVideoDraftSchema.parse({
		channelId: input.channelId,
		originalFilename: `${url.hostname.replace(/^www\./, "")}.mp4`,
		title: input.title,
		analysisPrompt: input.analysisPrompt,
		sourceType: "url",
		sourceUrl: url.toString(),
		languageHint: input.languageHint,
		mimeType: "video/mp4",
		sizeBytes: 1,
	});

	const video = await videoRepository.createDraft(draft);

	await jobRepository.enqueue({
		videoId: video.id,
		type: "download-source",
		payload: {
			sourceUrl: url.toString(),
		},
	});

	return video;
}
