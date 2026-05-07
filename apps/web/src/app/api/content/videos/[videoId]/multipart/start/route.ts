import { buildSourceStorageKey } from "~/modules/content-videos/domain/content-video.valueobject";
import { contentVideoRepository } from "~/modules/content-videos/infrastructure/content-video.repository";
import { requireRequestSession } from "~/server/http-auth";
import {
	createMultipartUploadPartUrls,
	createMultipartVideoUpload,
	MULTIPART_UPLOAD_PART_SIZE_BYTES,
} from "~/server/lib/contentclip-storage";

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

		const storageKey = buildSourceStorageKey(video.id, video.originalFilename);
		const partCount = Math.ceil(
			video.sizeBytes / MULTIPART_UPLOAD_PART_SIZE_BYTES,
		);

		if (partCount > 10000) {
			return Response.json(
				{
					success: false,
					error:
						"File requires more than 10,000 multipart segments. Increase part size before retrying.",
				},
				{ status: 400 },
			);
		}

		const multipartUpload = await createMultipartVideoUpload({
			key: storageKey,
			contentType: video.mimeType,
		});

		const parts = await createMultipartUploadPartUrls({
			key: storageKey,
			uploadId: multipartUpload.uploadId,
			partNumbers: Array.from({ length: partCount }, (_, index) => index + 1),
		});

		return Response.json({
			success: true,
			data: {
				videoId: video.id,
				storageKey,
				uploadId: multipartUpload.uploadId,
				partSizeBytes: MULTIPART_UPLOAD_PART_SIZE_BYTES,
				parts,
			},
		});
	} catch (error) {
		console.error("Failed to create multipart upload:", error);
		return Response.json(
			{
				success: false,
				error:
					error instanceof Error
						? error.message
						: "Failed to create multipart upload",
			},
			{ status: 500 },
		);
	}
}
