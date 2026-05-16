import { contentJobRepository } from "~/modules/content-jobs/infrastructure/content-job.repository";
import { markContentVideoUploaded } from "~/modules/content-videos/application/mark-content-video-uploaded";
import { contentVideoRepository } from "~/modules/content-videos/infrastructure/content-video.repository";
import { requireRequestSession } from "~/server/http-auth";
import { completeMultipartVideoUpload } from "~/server/lib/clipse-storage";

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

		const payload = (await request.json()) as {
			uploadId?: string;
			storageKey?: string;
			parts?: Array<{ partNumber: number; etag: string }>;
		};

		if (!payload.uploadId || !payload.storageKey || !payload.parts?.length) {
			return Response.json(
				{ success: false, error: "Missing multipart completion payload" },
				{ status: 400 },
			);
		}

		await completeMultipartVideoUpload({
			key: payload.storageKey,
			uploadId: payload.uploadId,
			parts: payload.parts,
		});

		const updatedVideo = await markContentVideoUploaded(
			contentVideoRepository,
			contentJobRepository,
			{
				id: video.id,
				storageKey: payload.storageKey,
			},
		);

		return Response.json({
			success: true,
			data: updatedVideo,
		});
	} catch (error) {
		console.error("Failed to complete multipart upload:", error);
		void contentVideoRepository.updateStage({
			id: videoId,
			processingStage: "failed",
			latestError:
				error instanceof Error
					? error.message
					: "Failed to complete multipart upload",
		});
		return Response.json(
			{
				success: false,
				error:
					error instanceof Error
						? error.message
						: "Failed to complete multipart upload",
			},
			{ status: 500 },
		);
	}
}
