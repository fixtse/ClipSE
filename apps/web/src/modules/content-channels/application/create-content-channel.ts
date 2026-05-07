import type { ContentChannelRepositoryInterface } from "../domain/content-channel.repository.interface";
import {
	type ContentChannel,
	type CreateContentChannelInput,
	CreateContentChannelSchema,
} from "../domain/content-channel.valueobject";

export async function createContentChannel(
	channelRepository: ContentChannelRepositoryInterface,
	input: CreateContentChannelInput,
): Promise<ContentChannel> {
	const validatedInput = CreateContentChannelSchema.parse(input);
	return channelRepository.create(validatedInput);
}
