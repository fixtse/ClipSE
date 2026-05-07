import type {
	ContentChannel,
	CreateContentChannelInput,
	UpdateContentChannelBumperInput,
} from "./content-channel.valueobject";

export interface ContentChannelRepositoryInterface {
	create(input: CreateContentChannelInput): Promise<ContentChannel>;
	findById(id: string): Promise<ContentChannel | null>;
	listAll(): Promise<ContentChannel[]>;
	updateLogo(input: {
		id: string;
		storageKey: string | null;
		mimeType: string | null;
	}): Promise<ContentChannel>;
	updateBumper(input: UpdateContentChannelBumperInput): Promise<ContentChannel>;
}
