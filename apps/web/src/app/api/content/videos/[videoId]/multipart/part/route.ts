import { contentVideoRepository } from "~/modules/content-videos/infrastructure/content-video.repository";
import { requireRequestSession } from "~/server/http-auth";
import { uploadMultipartVideoPart } from "~/server/lib/contentclip-storage";

interface RouteContext {
	params: Promise<{
		videoId: string;
	}>;
}

export async function POST(request: Request, context: RouteContext) {
	const { videoId } = await context.params;

	try {
		const authError = await requireRequestSession(request);
		if (authError) return authError;

		const video = await contentVideoRepository.findById(videoId);
		if (!video) {
			return Response.json(
				{ success: false, error: "Video draft not found" },
				{ status: 404 },
			);
		}

		const uploadId = request.headers.get("x-upload-id");
		const storageKey = request.headers.get("x-storage-key");
		const partNumberRaw = request.headers.get("x-part-number");

		if (!uploadId || !storageKey || !partNumberRaw) {
			return Response.json(
				{ success: false, error: "Missing multipart part upload headers" },
				{ status: 400 },
			);
		}

		const partNumber = Number.parseInt(partNumberRaw, 10);
		if (!Number.isFinite(partNumber) || partNumber < 1) {
			return Response.json(
				{ success: false, error: "Invalid multipart part number" },
				{ status: 400 },
			);
		}

		const arrayBuffer = await request.arrayBuffer();
		const body = new Uint8Array(arrayBuffer);
		if (body.byteLength === 0) {
			return Response.json(
				{ success: false, error: "Missing multipart part body" },
				{ status: 400 },
			);
		}

		const result = await uploadMultipartVideoPart({
			key: storageKey,
			uploadId,
			partNumber,
			body,
		});

		return Response.json({
			success: true,
			data: {
				etag: result.etag,
			},
		});
	} catch (error) {
		console.error("Failed to upload multipart part:", error);
		return Response.json(
			{
				success: false,
				error:
					error instanceof Error
						? error.message
						: "Failed to upload multipart part",
			},
			{ status: 500 },
		);
	}
}
