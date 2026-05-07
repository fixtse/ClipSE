import { Readable } from "node:stream";
import { contentClipRepository } from "~/modules/content-clips/infrastructure/content-clip.repository";
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
		clipId: string;
	}>;
}

export async function GET(request: Request, context: RouteContext) {
	const authError = await requireRequestSession(request);
	if (authError) return authError;

	const { clipId } = await context.params;
	const clip = await contentClipRepository.findById(clipId);

	if (!clip?.outputStorageKey) {
		return new Response("Rendered clip not found", { status: 404 });
	}

	const cachedFile = await findCachedMediaFile(clip.outputStorageKey);
	if (cachedFile) {
		return createLocalMediaResponse({
			filePath: cachedFile.filePath,
			sizeBytes: cachedFile.sizeBytes,
			contentType: "video/mp4",
			request,
		});
	}

	const range = request.headers.get("range") ?? undefined;
	const object = await getStorageObjectStreamWithRange({
		key: clip.outputStorageKey,
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

	const { clipId } = await context.params;
	const clip = await contentClipRepository.findById(clipId);

	if (!clip?.outputStorageKey) {
		return new Response(null, { status: 404 });
	}

	const cachedFile = await findCachedMediaFile(clip.outputStorageKey);
	if (cachedFile) {
		return new Response(null, {
			headers: buildLocalMediaHeaders({
				contentType: "video/mp4",
				sizeBytes: cachedFile.sizeBytes,
			}),
		});
	}

	const object = await getStorageObjectMetadata(clip.outputStorageKey);

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
