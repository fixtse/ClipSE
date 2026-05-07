import type { TranslateFn } from "./content-clip-dashboard-view";

export async function uploadContentVideoFile(
	videoId: string,
	file: File,
	onProgress: (progress: number) => void,
	translate: TranslateFn,
): Promise<void> {
	const startResponse = await fetch(
		`/api/content/videos/${videoId}/multipart/start`,
		{
			method: "POST",
		},
	);

	if (!startResponse.ok) {
		throw new Error(translate("workspace.toasts.uploadInitializeFailed"));
	}

	const startPayload = (await startResponse.json()) as {
		success: boolean;
		error?: string;
		data?: {
			storageKey: string;
			uploadId: string;
			partSizeBytes: number;
			parts: Array<{ partNumber: number; url: string }>;
		};
	};

	if (!startPayload.success || !startPayload.data) {
		throw new Error(
			startPayload.error ?? translate("workspace.toasts.uploadStartFailed"),
		);
	}

	const { uploadId, storageKey, partSizeBytes, parts } = startPayload.data;
	const loadedByPart = new Map<number, number>();
	const uploadedParts: Array<{ partNumber: number; etag: string }> = [];

	const updateProgress = () => {
		const bytesUploaded = Array.from(loadedByPart.values()).reduce(
			(total, value) => total + value,
			0,
		);
		onProgress(Math.round((bytesUploaded / file.size) * 100));
	};

	const uploadSinglePart = async (part: {
		partNumber: number;
		url: string;
	}): Promise<void> => {
		const start = (part.partNumber - 1) * partSizeBytes;
		const end = Math.min(start + partSizeBytes, file.size);
		const chunk = file.slice(start, end);

		const uploadPartViaAppProxy = async (): Promise<string> => {
			const response = await fetch(
				`/api/content/videos/${videoId}/multipart/part`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/octet-stream",
						"x-part-number": String(part.partNumber),
						"x-storage-key": storageKey,
						"x-upload-id": uploadId,
					},
					body: chunk,
				},
			);

			const payload = (await response.json()) as {
				success: boolean;
				error?: string;
				data?: {
					etag: string;
				};
			};

			if (!response.ok || !payload.success || !payload.data?.etag) {
				throw new Error(
					payload.error ??
						translate("workspace.toasts.uploadMultipartPartFailed", {
							part: part.partNumber,
						}),
				);
			}

			loadedByPart.set(part.partNumber, chunk.size);
			updateProgress();

			return payload.data.etag;
		};

		const etag = await new Promise<string>((resolve, reject) => {
			const request = new XMLHttpRequest();
			request.open("PUT", part.url);
			request.setRequestHeader("Content-Type", "application/octet-stream");

			request.upload.onprogress = (event) => {
				if (!event.lengthComputable) {
					return;
				}

				loadedByPart.set(part.partNumber, event.loaded);
				updateProgress();
			};

			request.onerror = () => {
				console.warn(
					"Direct multipart upload failed, retrying through app proxy.",
					{
						partNumber: part.partNumber,
						target: part.url,
					},
				);
				void uploadPartViaAppProxy().then(resolve).catch(reject);
			};
			request.onload = () => {
				if (request.status < 200 || request.status >= 300) {
					reject(
						new Error(
							translate("workspace.toasts.uploadMultipartPartFailed", {
								part: part.partNumber,
							}),
						),
					);
					return;
				}

				loadedByPart.set(part.partNumber, chunk.size);
				updateProgress();
				const responseEtag = request.getResponseHeader("ETag");
				if (!responseEtag) {
					reject(
						new Error(
							translate("workspace.toasts.uploadMissingEtag", {
								part: part.partNumber,
							}),
						),
					);
					return;
				}

				resolve(responseEtag);
			};

			request.send(chunk);
		});

		uploadedParts.push({
			partNumber: part.partNumber,
			etag,
		});
	};

	try {
		const concurrency = 4;
		let nextIndex = 0;
		await Promise.all(
			Array.from({ length: Math.min(concurrency, parts.length) }, async () => {
				for (;;) {
					const part = parts[nextIndex];
					nextIndex += 1;
					if (!part) {
						return;
					}

					await uploadSinglePart(part);
				}
			}),
		);

		const completeResponse = await fetch(
			`/api/content/videos/${videoId}/multipart/complete`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					uploadId,
					storageKey,
					parts: uploadedParts,
				}),
			},
		);

		const completePayload = (await completeResponse.json()) as {
			success: boolean;
			error?: string;
		};

		if (!completeResponse.ok || !completePayload.success) {
			throw new Error(
				completePayload.error ??
					translate("workspace.toasts.uploadFinalizeFailed"),
			);
		}
	} catch (error) {
		await fetch(`/api/content/videos/${videoId}/multipart/abort`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				uploadId,
				storageKey,
			}),
		}).catch(() => undefined);

		throw error;
	}
}
