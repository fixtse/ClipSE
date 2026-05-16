import { requireRequestSession } from "~/server/http-auth";
import { abortMultipartVideoUpload } from "~/server/lib/clipse-storage";

export async function POST(request: Request) {
	try {
		const authError = await requireRequestSession(request);
		if (authError) return authError;

		const payload = (await request.json()) as {
			uploadId?: string;
			storageKey?: string;
		};

		if (!payload.uploadId || !payload.storageKey) {
			return Response.json(
				{ success: false, error: "Missing multipart abort payload" },
				{ status: 400 },
			);
		}

		await abortMultipartVideoUpload({
			key: payload.storageKey,
			uploadId: payload.uploadId,
		});

		return Response.json({ success: true });
	} catch (error) {
		console.error("Failed to abort multipart upload:", error);
		return Response.json(
			{
				success: false,
				error:
					error instanceof Error
						? error.message
						: "Failed to abort multipart upload",
			},
			{ status: 500 },
		);
	}
}
