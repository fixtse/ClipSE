import { Readable } from "node:stream";
import { contentChannelRepository } from "~/modules/content-channels/infrastructure/content-channel.repository";
import { requireRequestSession } from "~/server/http-auth";
import {
	getStorageObjectMetadata,
	getStorageObjectStreamWithRange,
} from "~/server/lib/clipse-storage";

interface RouteContext {
	params: Promise<{
		channelId: string;
	}>;
}

export async function GET(request: Request, context: RouteContext) {
	const authError = await requireRequestSession(request);
	if (authError) return authError;

	const { channelId } = await context.params;
	const channel = await contentChannelRepository.findById(channelId);

	if (!channel?.logoStorageKey) {
		return new Response("Channel logo not found", { status: 404 });
	}

	const range = request.headers.get("range") ?? undefined;
	const object = await getStorageObjectStreamWithRange({
		key: channel.logoStorageKey,
		range,
	});
	const body =
		"transformToWebStream" in object.body
			? (object.body.transformToWebStream() as unknown as ReadableStream)
			: (Readable.toWeb(
					object.body as unknown as Readable,
				) as unknown as ReadableStream);

	return new Response(body, {
		status: range ? 206 : 200,
		headers: {
			"Content-Type": object.contentType,
			"Cache-Control": "private, max-age=300",
			...(object.contentLength
				? {
						"Content-Length": object.contentLength.toString(),
					}
				: {}),
			...(object.contentRange
				? {
						"Content-Range": object.contentRange,
					}
				: {}),
			...(object.etag
				? {
						ETag: object.etag,
					}
				: {}),
		},
	});
}

export async function HEAD(request: Request, context: RouteContext) {
	const authError = await requireRequestSession(request);
	if (authError) return authError;

	const { channelId } = await context.params;
	const channel = await contentChannelRepository.findById(channelId);

	if (!channel?.logoStorageKey) {
		return new Response(null, { status: 404 });
	}

	const object = await getStorageObjectMetadata(channel.logoStorageKey);

	return new Response(null, {
		headers: {
			"Content-Type": object.contentType,
			"Cache-Control": "private, max-age=300",
			...(object.contentLength
				? {
						"Content-Length": object.contentLength.toString(),
					}
				: {}),
			...(object.etag
				? {
						ETag: object.etag,
					}
				: {}),
			...(object.lastModified
				? {
						"Last-Modified": object.lastModified.toUTCString(),
					}
				: {}),
		},
	});
}
