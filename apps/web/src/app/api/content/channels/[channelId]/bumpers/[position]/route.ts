import { Readable } from "node:stream";
import { contentChannelRepository } from "~/modules/content-channels/infrastructure/content-channel.repository";
import { requireRequestSession } from "~/server/http-auth";
import {
	buildLocalMediaHeaders,
	createLocalMediaResponse,
	findCachedMediaFile,
} from "~/server/lib/contentclip-local-media";
import {
	getStorageObjectMetadata,
	getStorageObjectStreamWithRange,
} from "~/server/lib/contentclip-storage";

interface RouteContext {
	params: Promise<{
		channelId: string;
		position: string;
	}>;
}

function resolveBumper(
	channel: {
		introStorageKey: string | null;
		introMimeType: string | null;
		outroStorageKey: string | null;
		outroMimeType: string | null;
	},
	position: string,
) {
	if (position === "intro") {
		return {
			storageKey: channel.introStorageKey,
			mimeType: channel.introMimeType ?? "video/mp4",
		};
	}

	if (position === "outro") {
		return {
			storageKey: channel.outroStorageKey,
			mimeType: channel.outroMimeType ?? "video/mp4",
		};
	}

	return null;
}

export async function GET(request: Request, context: RouteContext) {
	const authError = await requireRequestSession(request);
	if (authError) return authError;

	const { channelId, position } = await context.params;
	const channel = await contentChannelRepository.findById(channelId);
	const bumper = channel ? resolveBumper(channel, position) : null;

	if (!bumper?.storageKey) {
		return new Response("Bumper video not found", { status: 404 });
	}

	const cachedFile = await findCachedMediaFile(bumper.storageKey);
	if (cachedFile) {
		return createLocalMediaResponse({
			filePath: cachedFile.filePath,
			sizeBytes: cachedFile.sizeBytes,
			contentType: bumper.mimeType,
			request,
		});
	}

	const range = request.headers.get("range") ?? undefined;
	const object = await getStorageObjectStreamWithRange({
		key: bumper.storageKey,
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
			"Accept-Ranges": "bytes",
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

	const { channelId, position } = await context.params;
	const channel = await contentChannelRepository.findById(channelId);
	const bumper = channel ? resolveBumper(channel, position) : null;

	if (!bumper?.storageKey) {
		return new Response(null, { status: 404 });
	}

	const cachedFile = await findCachedMediaFile(bumper.storageKey);
	if (cachedFile) {
		return new Response(null, {
			headers: buildLocalMediaHeaders({
				contentType: bumper.mimeType,
				sizeBytes: cachedFile.sizeBytes,
			}),
		});
	}

	const object = await getStorageObjectMetadata(bumper.storageKey);

	return new Response(null, {
		headers: {
			"Content-Type": object.contentType,
			"Accept-Ranges": "bytes",
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
