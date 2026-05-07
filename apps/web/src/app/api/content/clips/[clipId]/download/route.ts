import { Readable } from "node:stream";
import { contentClipRepository } from "~/modules/content-clips/infrastructure/content-clip.repository";
import { requireRequestSession } from "~/server/http-auth";
import { getStorageObjectStream } from "~/server/lib/contentclip-storage";

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

	const object = await getStorageObjectStream(clip.outputStorageKey);
	await contentClipRepository.markDownloaded(clip.id);
	const body =
		"transformToWebStream" in object.body
			? (object.body.transformToWebStream() as unknown as ReadableStream)
			: (Readable.toWeb(
					object.body as unknown as Readable,
				) as unknown as ReadableStream);

	return new Response(body, {
		headers: {
			"Content-Type": object.contentType,
			...(object.contentLength
				? {
						"Content-Length": object.contentLength.toString(),
					}
				: {}),
			"Content-Disposition": `attachment; filename="${clip.outputFilename ?? `${clip.id}.mp4`}"`,
		},
	});
}
