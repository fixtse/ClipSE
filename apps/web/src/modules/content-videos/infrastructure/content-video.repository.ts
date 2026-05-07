import { desc, eq } from "drizzle-orm";
import { db } from "~/server/db";
import { contentVideos } from "~/server/db/schema";
import type { ContentVideoRepositoryInterface } from "../domain/content-video.repository.interface";
import type {
	ContentVideo,
	CreateContentVideoDraftInput,
	UpdateContentVideoBumperInput,
	UpdateContentVideoInput,
	UpdateContentVideoStageInput,
} from "../domain/content-video.valueobject";
import { buildVideoTitle } from "../domain/content-video.valueobject";

export class ContentVideoRepository implements ContentVideoRepositoryInterface {
	async createDraft(
		input: CreateContentVideoDraftInput,
	): Promise<ContentVideo> {
		const [video] = await db
			.insert(contentVideos)
			.values({
				originalFilename: input.originalFilename,
				channelId: input.channelId ?? null,
				title: buildVideoTitle(input.originalFilename, input.title),
				analysisPrompt: input.analysisPrompt?.trim() ?? "",
				sourceType: input.sourceType ?? "file",
				sourceUrl: input.sourceUrl?.trim() ?? null,
				languageHint: input.languageHint?.trim() ?? "auto",
				mimeType: input.mimeType ?? "video/mp4",
				sizeBytes: input.sizeBytes,
				processingStage: "uploading",
				createdAt: new Date(),
				updatedAt: new Date(),
			})
			.returning();

		if (!video) {
			throw new Error("Failed to create upload draft");
		}

		return this.map(video);
	}

	async findById(id: string): Promise<ContentVideo | null> {
		const [video] = await db
			.select()
			.from(contentVideos)
			.where(eq(contentVideos.id, id));

		return video ? this.map(video) : null;
	}

	async listAll(): Promise<ContentVideo[]> {
		const videos = await db
			.select()
			.from(contentVideos)
			.orderBy(desc(contentVideos.createdAt));

		return videos.map((video) => this.map(video));
	}

	async listByChannelId(channelId: string): Promise<ContentVideo[]> {
		const videos = await db
			.select()
			.from(contentVideos)
			.where(eq(contentVideos.channelId, channelId))
			.orderBy(desc(contentVideos.createdAt));

		return videos.map((video) => this.map(video));
	}

	async update(input: UpdateContentVideoInput): Promise<ContentVideo> {
		const [updated] = await db
			.update(contentVideos)
			.set({
				title: input.title?.trim(),
				analysisPrompt: input.analysisPrompt?.trim(),
				languageHint: input.languageHint?.trim(),
				updatedAt: new Date(),
			})
			.where(eq(contentVideos.id, input.id))
			.returning();

		if (!updated) {
			throw new Error("Video not found");
		}

		return this.map(updated);
	}

	async updateBumper(
		input: UpdateContentVideoBumperInput,
	): Promise<ContentVideo> {
		const [updated] = await db
			.update(contentVideos)
			.set({
				...(input.position === "intro"
					? {
							introStorageKey: input.storageKey,
							introMimeType: input.mimeType,
						}
					: {
							outroStorageKey: input.storageKey,
							outroMimeType: input.mimeType,
						}),
				updatedAt: new Date(),
			})
			.where(eq(contentVideos.id, input.id))
			.returning();

		if (!updated) {
			throw new Error("Video not found");
		}

		return this.map(updated);
	}

	async updateStage(
		input: UpdateContentVideoStageInput,
	): Promise<ContentVideo> {
		const [updated] = await db
			.update(contentVideos)
			.set({
				processingStage: input.processingStage,
				detectedLanguage: input.detectedLanguage ?? undefined,
				durationSeconds: input.durationSeconds ?? undefined,
				frameRate: input.frameRate ?? undefined,
				waveformSamples: input.waveformSamples ?? undefined,
				latestError:
					input.latestError === undefined ? undefined : input.latestError,
				updatedAt: new Date(),
			})
			.where(eq(contentVideos.id, input.id))
			.returning();

		if (!updated) {
			throw new Error("Video not found");
		}

		return this.map(updated);
	}

	async markUploaded(input: {
		id: string;
		storageKey: string;
	}): Promise<ContentVideo> {
		const [updated] = await db
			.update(contentVideos)
			.set({
				storageKey: input.storageKey,
				processingStage: "queued",
				uploadCompletedAt: new Date(),
				latestError: null,
				updatedAt: new Date(),
			})
			.where(eq(contentVideos.id, input.id))
			.returning();

		if (!updated) {
			throw new Error("Video not found");
		}

		return this.map(updated);
	}

	async markDownloaded(input: {
		id: string;
		originalFilename: string;
		title?: string;
		mimeType: string;
		sizeBytes: number;
		storageKey: string;
	}): Promise<ContentVideo> {
		const [updated] = await db
			.update(contentVideos)
			.set({
				originalFilename: input.originalFilename,
				title: input.title?.trim() || undefined,
				mimeType: input.mimeType,
				sizeBytes: input.sizeBytes,
				storageKey: input.storageKey,
				processingStage: "queued",
				uploadCompletedAt: new Date(),
				latestError: null,
				updatedAt: new Date(),
			})
			.where(eq(contentVideos.id, input.id))
			.returning();

		if (!updated) {
			throw new Error("Video not found");
		}

		return this.map(updated);
	}

	async delete(id: string): Promise<void> {
		await db.delete(contentVideos).where(eq(contentVideos.id, id));
	}

	private map(row: typeof contentVideos.$inferSelect): ContentVideo {
		return {
			id: row.id,
			channelId: row.channelId ?? null,
			originalFilename: row.originalFilename,
			title: row.title,
			analysisPrompt: row.analysisPrompt,
			sourceType: row.sourceType as ContentVideo["sourceType"],
			sourceUrl: row.sourceUrl ?? null,
			languageHint: row.languageHint,
			detectedLanguage: row.detectedLanguage ?? null,
			storageKey: row.storageKey ?? null,
			introStorageKey: row.introStorageKey ?? null,
			introMimeType: row.introMimeType ?? null,
			outroStorageKey: row.outroStorageKey ?? null,
			outroMimeType: row.outroMimeType ?? null,
			mimeType: row.mimeType,
			sizeBytes: row.sizeBytes,
			durationSeconds: row.durationSeconds ?? null,
			frameRate: row.frameRate ?? null,
			waveformSamples: row.waveformSamples as number[],
			processingStage: row.processingStage as ContentVideo["processingStage"],
			latestError: row.latestError ?? null,
			uploadCompletedAt: row.uploadCompletedAt ?? null,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
		};
	}
}

export const contentVideoRepository = new ContentVideoRepository();
