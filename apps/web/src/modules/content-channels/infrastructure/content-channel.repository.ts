import { asc, eq } from "drizzle-orm";
import { db } from "~/server/db";
import { contentChannels } from "~/server/db/schema";
import type { ContentChannelRepositoryInterface } from "../domain/content-channel.repository.interface";
import type {
	ContentChannel,
	CreateContentChannelInput,
	UpdateContentChannelBumperInput,
} from "../domain/content-channel.valueobject";

export class ContentChannelRepository
	implements ContentChannelRepositoryInterface
{
	async create(input: CreateContentChannelInput): Promise<ContentChannel> {
		const [channel] = await db
			.insert(contentChannels)
			.values({
				name: input.name.trim(),
				logoStorageKey: input.logoStorageKey ?? null,
				logoMimeType: input.logoMimeType ?? null,
				createdAt: new Date(),
				updatedAt: new Date(),
			})
			.returning();

		if (!channel) {
			throw new Error("Failed to create channel");
		}

		return this.map(channel);
	}

	async findById(id: string): Promise<ContentChannel | null> {
		const [channel] = await db
			.select()
			.from(contentChannels)
			.where(eq(contentChannels.id, id));

		return channel ? this.map(channel) : null;
	}

	async listAll(): Promise<ContentChannel[]> {
		const channels = await db
			.select()
			.from(contentChannels)
			.orderBy(asc(contentChannels.createdAt));

		return channels.map((channel) => this.map(channel));
	}

	async updateLogo(input: {
		id: string;
		storageKey: string | null;
		mimeType: string | null;
	}): Promise<ContentChannel> {
		const [updated] = await db
			.update(contentChannels)
			.set({
				logoStorageKey: input.storageKey,
				logoMimeType: input.mimeType,
				updatedAt: new Date(),
			})
			.where(eq(contentChannels.id, input.id))
			.returning();

		if (!updated) {
			throw new Error("Channel not found");
		}

		return this.map(updated);
	}

	async updateBumper(
		input: UpdateContentChannelBumperInput,
	): Promise<ContentChannel> {
		const [updated] = await db
			.update(contentChannels)
			.set({
				...(input.position === "intro"
					? {
							introStorageKey: input.storageKey,
							introMimeType: input.mimeType,
						}
					: input.position === "outro"
						? {
								outroStorageKey: input.storageKey,
								outroMimeType: input.mimeType,
							}
						: input.position === "verticalIntro"
							? {
									verticalIntroStorageKey: input.storageKey,
									verticalIntroMimeType: input.mimeType,
								}
							: {
									verticalOutroStorageKey: input.storageKey,
									verticalOutroMimeType: input.mimeType,
								}),
				updatedAt: new Date(),
			})
			.where(eq(contentChannels.id, input.id))
			.returning();

		if (!updated) {
			throw new Error("Channel not found");
		}

		return this.map(updated);
	}

	private map(row: typeof contentChannels.$inferSelect): ContentChannel {
		return {
			id: row.id,
			name: row.name,
			logoStorageKey: row.logoStorageKey ?? null,
			logoMimeType: row.logoMimeType ?? null,
			introStorageKey: row.introStorageKey ?? null,
			introMimeType: row.introMimeType ?? null,
			outroStorageKey: row.outroStorageKey ?? null,
			outroMimeType: row.outroMimeType ?? null,
			verticalIntroStorageKey: row.verticalIntroStorageKey ?? null,
			verticalIntroMimeType: row.verticalIntroMimeType ?? null,
			verticalOutroStorageKey: row.verticalOutroStorageKey ?? null,
			verticalOutroMimeType: row.verticalOutroMimeType ?? null,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
		};
	}
}

export const contentChannelRepository = new ContentChannelRepository();
