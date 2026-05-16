import { Readable } from "node:stream";
import { contentVideoRepository } from "~/modules/content-videos/infrastructure/content-video.repository";
import { requireRequestSession } from "~/server/http-auth";
import {
	buildLocalMediaHeaders,
	createLocalMediaResponse,
	findCachedMediaFile,
} from "~/server/lib/clipse-local-media";
import {
	getStorageObjectMetadata,
	getStorageObjectStreamWithRange,
} from "~/server/lib/clipse-storage";

interface RouteContext {
	params: Promise<{
		videoId: string;
	}>;
}

export async function GET(request: Request, context: RouteContext) {
	const authError = await requireRequestSession(request);
	if (authError) return authError;

	const { videoId } = await context.params;
	const video = await contentVideoRepository.findById(videoId);

	if (!video?.storageKey) {
		return new Response("Video source not found", { status: 404 });
	}

	const cachedFile = await findCachedMediaFile(video.storageKey);
	if (cachedFile) {
		return createLocalMediaResponse({
			filePath: cachedFile.filePath,
			sizeBytes: cachedFile.sizeBytes,
			contentType: video.mimeType,
			request,
		});
	}

	const range = request.headers.get("range") ?? undefined;
	const object = await getStorageObjectStreamWithRange({
		key: video.storageKey,
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

	const { videoId } = await context.params;
	const video = await contentVideoRepository.findById(videoId);

	if (!video?.storageKey) {
		return new Response(null, { status: 404 });
	}

	const cachedFile = await findCachedMediaFile(video.storageKey);
	if (cachedFile) {
		return new Response(null, {
			headers: buildLocalMediaHeaders({
				contentType: video.mimeType,
				sizeBytes: cachedFile.sizeBytes,
			}),
		});
	}

	const object = await getStorageObjectMetadata(video.storageKey);

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
